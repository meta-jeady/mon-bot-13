const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

const PREFIX = '.';
let OWNER = '';
let BOT_NUMBER = '';
const warnings = {};
const CONFIG_FILE = './config.json';
const GROUP_LINK = 'https://chat.whatsapp.com/GtBg9UmAV0k0ZwyfA07NkX?s=cl&p=a&ilr=0'; // BOUTON

let antilink = false;
if (fs.existsSync(CONFIG_FILE)) {
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE));
    antilink = config.antilink || false;
}

function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ antilink }, null, 2));
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session');
    const sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['DXS Bot', 'Chrome', '11.3']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n==== SCAN QR CODE BELOW ====\n');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'open') {
            BOT_NUMBER = sock.user.id.split(':')[0] + '@s.whatsapp.net';
            OWNER = BOT_NUMBER;
            console.log('✅ Bot connected successfully');
            console.log('Bot number:', sock.user.id.split(':')[0]);
        }
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) setTimeout(() => startBot(), 3000);
        }
    });

    const getNumber = (jid) => {
        if (!jid) return '';
        return jid.split(':')[0].split('@')[0].replace(/\D/g, '');
    };

    sock.ev.on('messages.upsert', async ({ messages }) => {
        try {
            const msg = messages[0];
            if (!msg.message) return;

            const from = msg.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const sender = msg.key.participant || msg.key.remoteJid;
            const senderNum = getNumber(sender);
            const botNum = getNumber(BOT_NUMBER);
            const ownerNum = getNumber(OWNER);
            const isOwner = msg.key.fromMe || senderNum === ownerNum || senderNum === botNum;

            const text = msg.message.conversation
                || msg.message.extendedTextMessage?.text
                || msg.message.imageMessage?.caption
                || msg.message.videoMessage?.caption
                || '';

            if (antilink && isGroup && text && /https?:\/\/|www\./i.test(text) &&!isOwner) {
                const metadata = await sock.groupMetadata(from);
                const participant = metadata.participants.find(p => getNumber(p.id) === senderNum);
                const isAdmin = participant?.admin === 'admin' || participant?.admin === 'superadmin';
                if (isAdmin) return;
                const warnKey = `${from}_${senderNum}`;
                warnings[warnKey] = (warnings[warnKey] || 0) + 1;
                const count = warnings[warnKey];
                try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
                if (count < 3) {
                    await sock.sendMessage(from, { text: `⚠️ *WARNING ${count}/3*\n\n@${senderNum} Links are not allowed in this group!\n\nYou have *${3 - count}* warning(s) left before being kicked.`, mentions: [sender] });
                } else {
                    await sock.sendMessage(from, { text: `❌ @${senderNum} reached the limit of *3 warnings*.\n\nYou are kicked for posting links.`, mentions: [sender] });
                    try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch { await sock.sendMessage(from, { text: '⚠️ Cannot kick. Bot must be admin' }); }
                    delete warnings[warnKey];
                }
                return;
            }

            if (!text.startsWith(PREFIX)) return;
            const args = text.slice(PREFIX.length).trim().split(/ +/);
            const command = args.shift().toLowerCase();

            const getGroupAdmins = async () => {
                if (!isGroup) return { isAdmin: false, isBotAdmin: false, metadata: null };
                const metadata = await sock.groupMetadata(from);
                const participants = metadata.participants;
                let isAdmin = false;
                let isBotAdmin = false;
                for (const p of participants) {
                    const pNum = getNumber(p.id);
                    const isAdm = p.admin === 'admin' || p.admin === 'superadmin';
                    if (pNum === senderNum && isAdm) isAdmin = true;
                    if (pNum === botNum && isAdm) isBotAdmin = true;
                }
                if (isOwner) isAdmin = true;
                return { isAdmin, isBotAdmin, metadata };
            };

            // ================== PING PRO STYLÉ ==================
            if (command === 'ping') {
                const start = Date.now();
                const sent = await sock.sendMessage(from, { text: '🏓 *Calculating latency...*' });
                const latency = Date.now() - start;
                let status = latency < 100? '🟢 Excellent' : latency < 300? '🟡 Good' : '🔴 Slow';
                await sock.sendMessage(from, {
                    text: `╭─❒ 「 *🏓 PING PRO* 」 ❒─╮
│
│ ⚡ *Latency* : ${latency} ms
│ 📡 *Status* : ${status}
│ 🤖 *Bot* : DXS Bot V11.3
│ 💻 *Server* : Online
│
╰─❒ *Speed Test Complete* ❒─╯`,
                edit: sent.key });
            }

            else if (command === 'alive') {
                await sock.sendMessage(from, { text: `✅ *DXS BOT V11.3 PRO* is Online\n⏱️ Uptime: ${Math.floor(process.uptime()/60)} min` });
            }

            else if (command === 'menu') {
                let logoBuffer = null;
                if (fs.existsSync('./logo.jpg')) logoBuffer = fs.readFileSync('./logo.jpg');
                const uptime = process.uptime();
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const date = new Date().toLocaleDateString('en-US');
                const menu = `╭─❒ 「 *DXS BOT V11.3 PRO* 」 ❒─╮\n│\n│ 👑 *Owner* : @${ownerNum}\n│ 🤖 *Version* : 11.3.0 PRO\n│ 📌 *Prefix* : ${PREFIX}\n│ ⏱️ *Uptime* : ${hours}h ${minutes}m\n│ 📅 *Date* : ${date}\n│ 🔒 *Anti-link* : ${antilink? 'ON ✅' : 'OFF ❌'}\n│\n╠══「 *📜 GENERAL* 」══\n│ ${PREFIX}ping - Check latency\n│ ${PREFIX}alive - Bot status \n│ ${PREFIX}menu - Show menu\n│ ${PREFIX}info - Bot information\n│ ${PREFIX}owner - Contact owner\n│ ${PREFIX}jid - Get chat ID\n│ ${PREFIX}restart - Restart bot\n│ ${PREFIX}logo - Change bot logo\n│ ${PREFIX}setname - Change bot name\n│ ${PREFIX}del - Delete message\n│\n╠══「 *👥 GROUP* 」══\n│ ${PREFIX}tagall - Tag all members\n│ ${PREFIX}tagallpro - Tag all PRO\n│ ${PREFIX}hidetag - Hidden tag\n│ ${PREFIX}open - Open group\n│ ${PREFIX}close - Close group\n│ ${PREFIX}kick @ - Kick member\n│ ${PREFIX}promote @ - Make admin\n│ ${PREFIX}demote @ - Remove admin\n│\n╠══「 *🛠️ TOOLS* 」══\n│ ${PREFIX}vv - View once message\n│ ${PREFIX}antilink on/off - Anti link\n│\n╰─❒ *BY kčø4p tech* ❒─╯\n> *DXS Bot - Verified & Secured* ✅`;
                await sock.sendMessage(from, {
                    text: menu,
                    contextInfo: {
                        mentionedJid: [OWNER],
                        forwardingScore: 999,
                        isForwarded: true,
                        externalAdReply: {
                            title: "DXS BOT V11.3 PRO ✅",
                            body: "Verified WhatsApp Bot | Multi-Device",
                            thumbnail: logoBuffer,
                            mediaType: 1,
                            renderLargerThumbnail: true,
                            sourceUrl: `https://wa.me/${ownerNum}`
                        }
                    }
                });
            }

            else if (command === 'info') {
                await sock.sendMessage(from, { text: `╭───「 *BOT INFO* 」\n│\n│ 🤖 *Name* : DXS Bot V11.3\n│ 👑 *Owner* : ${ownerNum}\n│ 📌 *Prefix* : ${PREFIX}\n│ 📅 *Version* : 11.3 EN\n│\n╰───────────────` });
            }

            else if (command === 'owner') { await sock.sendMessage(from, { text: `👑 *Owner* : wa.me/${ownerNum}` }); }
            else if (command === 'jid') { await sock.sendMessage(from, { text: `*Chat ID:*\n${from}` }); }
            else if (command === 'restart' && isOwner) { await sock.sendMessage(from, { text: '🔄 Restarting...' }); process.exit(1); }
            else if (command === 'setname' && isOwner) { const name = args.join(' '); if (!name) return sock.sendMessage(from, { text: '❌ Example:.setname DXS BOT' }); await sock.updateProfileStatus(name); await sock.sendMessage(from, { text: `✅ Bot name changed to: *${name}*` }); }
            else if ((command === 'logo' || command === 'setpp') && isOwner) {
                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted ||!quoted.imageMessage) return sock.sendMessage(from, { text: '❌ *Reply* to an image with the.logo command' });
                try { const buffer = await downloadMediaMessage({ message: quoted }, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }); await sock.updateProfilePicture(BOT_NUMBER, buffer); await sock.sendMessage(from, { text: '✅ *Bot logo updated successfully!*' }); } catch (err) { console.error('Logo error:', err); await sock.sendMessage(from, { text: '❌ Cannot change logo.' }); }
            }
            else if (command === 'del') { const msgToDelete = msg.message?.extendedTextMessage?.contextInfo?.stanzaId; if (msgToDelete) await sock.sendMessage(from, { delete: { remoteJid: from, id: msgToDelete, fromMe: false } }); }
            else if ((command === 'antilink' || command === 'antilnk') && isOwner) {
                if (!args[0] ||!['on', 'off'].includes(args[0].toLowerCase())) return sock.sendMessage(from, { text: '❌ Usage:.antilink on / off' });
                antilink = args[0].toLowerCase() === 'on'; saveConfig();
                await sock.sendMessage(from, { text: `Anti-link: ${antilink? '✅ ENABLED' : '❌ DISABLED'}` });
            }

            // ================== TAGALL PRO ==================
            else if (command === 'tagall' && isGroup) {
                const { isAdmin, isBotAdmin, metadata } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ This command is for admins and owner only.' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be group admin.' });
                try {
                    let txt = `*📢 TAG ALL*\n*Group:* ${metadata.subject}\n\n`;
                    let mentions = [];
                    for (let mem of metadata.participants) {
                        txt += `@${getNumber(mem.id)}\n`;
                        mentions.push(mem.id);
                    }
                    await sock.sendMessage(from, { text: txt, mentions });
                } catch (e) { await sock.sendMessage(from, { text: '❌ Error during tagall.' }); }
            }

            else if (command === 'tagallpro' && isGroup) { // NOUVEAU TAGALL PRO
                const { isAdmin, isBotAdmin, metadata } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ This command is for admins and owner only.' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be group admin.' });
                try {
                    const total = metadata.participants.length;
                    let txt = `╭─❒ 「 *📢 TAGALL PRO* 」 ❒─╮\n`;
                    txt += `│\n│ *Group:* ${metadata.subject}\n`;
                    txt += `│ *Total Members:* ${total}\n`;
                    txt += `│ *By:* @${senderNum}\n│\n`;
                    txt += `╠══「 *MEMBERS* 」══\n`;
                    let mentions = [];
                    metadata.participants.forEach((mem, i) => {
                        txt += `│ ${i+1}. @${getNumber(mem.id)}\n`;
                        mentions.push(mem.id);
                    });
                    txt += `╰─❒ *End of Tag* ❒─╯\n\n> Click button below to join our group 👇`;

                    await sock.sendMessage(from, {
                        text: txt,
                        mentions,
                        contextInfo: {
                            externalAdReply: {
                                title: "Join DXS Support Group",
                                body: "Click to join our official group",
                                thumbnail: fs.existsSync('./logo.jpg')? fs.readFileSync('./logo.jpg') : null,
                                mediaType: 1,
                                sourceUrl: GROUP_LINK
                            }
                        }
                    });
                } catch (e) { await sock.sendMessage(from, { text: '❌ Error during tagallpro.' }); }
            }

            else if (command === 'hidetag' && isGroup) {
                const { isAdmin, isBotAdmin, metadata } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ Admins only' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be admin' });
                await sock.sendMessage(from, { text: args.join(' ') || '📢 Message', mentions: metadata.participants.map(p => p.id) });
            }
            else if (command === 'open' && isGroup) {
                const { isAdmin, isBotAdmin } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ This command is for admins and owner only.' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be group admin.' });
                try { await sock.groupSettingUpdate(from, 'not_announcement'); await sock.sendMessage(from, { text: '🔓 *Group OPENED*\nEveryone can now send messages.' }); } catch (e) { await sock.sendMessage(from, { text: '❌ Cannot open group.\nMake sure bot is admin.' }); }
            }
            else if (command === 'close' && isGroup) {
                const { isAdmin, isBotAdmin } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ This command is for admins and owner only.' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be group admin.' });
                try { await sock.groupSettingUpdate(from, 'announcement'); await sock.sendMessage(from, { text: '🔒 *Group CLOSED*\nOnly admins can send messages.' }); } catch (e) { await sock.sendMessage(from, { text: '❌ Cannot close group.\nMake sure bot is admin.' }); }
            }
            else if (command === 'kick' && isGroup) {
                const { isAdmin, isBotAdmin } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ Admins only' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be admin' });
                const user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || msg.message.extendedTextMessage?.contextInfo?.participant;
                if (!user) return sock.sendMessage(from, { text: '❌ Mention the person to kick' });
                if (getNumber(user) === ownerNum || getNumber(user) === botNum) return sock.sendMessage(from, { text: '❌ Cannot kick owner or bot' });
                await sock.groupParticipantsUpdate(from, [user], 'remove'); await sock.sendMessage(from, { text: `✅ @${getNumber(user)} has been kicked`, mentions: [user] });
            }
            else if (command === 'promote' && isGroup) {
                const { isAdmin, isBotAdmin } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ Admins only' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be admin' });
                const user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (!user) return sock.sendMessage(from, { text: '❌ Mention the person to promote' });
                await sock.groupParticipantsUpdate(from, [user], 'promote'); await sock.sendMessage(from, { text: `✅ @${getNumber(user)} is now *admin*`, mentions: [user] });
            }
            else if (command === 'demote' && isGroup) {
                const { isAdmin, isBotAdmin } = await getGroupAdmins();
                if (!isAdmin) return sock.sendMessage(from, { text: '❌ Admins only' });
                if (!isBotAdmin &&!isOwner) return sock.sendMessage(from, { text: '❌ Bot must be admin' });
                const user = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                if (!user) return sock.sendMessage(from, { text: '❌ Mention the person to demote' });
                await sock.groupParticipantsUpdate(from, [user], 'demote'); await sock.sendMessage(from, { text: `✅ @${getNumber(user)} is no longer admin`, mentions: [user] });
            }
            else if (command === 'vv') {
                const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (!quoted) return sock.sendMessage(from, { text: '❌ *Reply* to a view-once message with.vv' });
                try {
                    let mediaType = Object.keys(quoted)[0];
                    let media = quoted[mediaType];
                    if (['viewOnceMessageV2', 'viewOnceMessage', 'viewOnceMessageV2Extension'].includes(mediaType)) { mediaType = Object.keys(media.message)[0]; media = media.message[mediaType]; }
                    if (['imageMessage', 'videoMessage', 'audioMessage'].includes(mediaType)) {
                        const buffer = await downloadMediaMessage({ message: { [mediaType]: media } }, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage });
                        if (mediaType === 'imageMessage') await sock.sendMessage(from, { image: buffer, caption: media.caption || '' });
                        else if (mediaType === 'videoMessage') await sock.sendMessage(from, { video: buffer, caption: media.caption || '' });
                        else if (mediaType === 'audioMessage') await sock.sendMessage(from, { audio: buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: media.ptt || false });
                    } else { await sock.sendMessage(from, { text: '❌ Media type not supported' }); }
                } catch (err) { console.error('VV Error:', err); await sock.sendMessage(from, { text: '❌ Cannot retrieve view-once' }); }
            }
        } catch (e) { console.error('General Error:', e); }
    });
}
startBot();
