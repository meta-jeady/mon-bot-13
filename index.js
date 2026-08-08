const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, fetchLatestBaileysVersion, downloadContentFromMessage } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const pino = require('pino')

const PREFIX = '.'
const BOTNAME = '𝚖𝚎𝚝𝚊 𝚓𝚎𝚊𝚍𝚢'
const VERSION = '𝚟3.0.0'
const OWNER = 'TON_NUMERO@s.whatsapp.net' // MET TON NUM

const FILES = { warns: './warns.json', antilink: './antilink.json', whitelist: './whitelist.json', antimot: './antimot.json', welcome: './welcome.json' }
let DATA = { warns: {}, antilink: {}, whitelist: {}, antimot: {}, welcome: {} }
for(const k in FILES) if(fs.existsSync(FILES[k])) DATA[k] = JSON.parse(fs.readFileSync(FILES[k]))
const save = k => fs.writeFileSync(FILES[k], JSON.stringify(DATA[k], null, 2))

const containsLink = t => /(https?:\/\/|www\.|wa\.me\/|t\.me\/|[a-z0-9-]+\.(com|net|org))/i.test(t)
const isWhitelisted = (t,g) => DATA.whitelist[g]?.some(d => t.toLowerCase().includes(d)) || false
const getText = m => m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || ''
const getAdmin = async (c,g,j) => { try{ return (await c.groupMetadata(g)).participants.find(p=>p.id.split(':')[0]===j.split(':')[0])?.admin }catch{return false} }

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const { version } = await fetchLatestBaileysVersion()
    const conn = makeWASocket({ version, auth: state, browser: Browsers.macOS('Desktop'), logger: pino({level: 'silent'}) })
    conn.ev.on('creds.update', saveCreds)

    conn.ev.on('connection.update', u => {
        if(u.qr){ console.log('\n📱 SCAN QR :\n'); qrcode.generate(u.qr, {small: true}) }
        if(u.connection === 'open') console.log(`🤖 ${BOTNAME} | ${VERSION} | 🟢 CONNECTÉ`)
        if(u.connection === 'close' && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) startBot()
    })

    // WELCOME
    conn.ev.on('group-participants.update', async ({id, participants, action}) => {
        if(!DATA.welcome[id]?.enabled) return
        for(const user of participants){
            const msg = action === 'add'? DATA.welcome[id].welcome : DATA.welcome[id].goodbye
            if(msg) await conn.sendMessage(id, {text: msg.replace('@user', '@'+user.split('@')[0]), mentions: [user]})
        }
    })

    conn.ev.on('messages.upsert', async ({ messages }) => {
        const mek = messages?.[0]
        if(!mek?.message || mek.key.fromMe) return
        const from = mek.key.remoteJid
        const sender = mek.key.participant || mek.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const body = getText(mek.message).trim()
        const reply = (text, mentions=[]) => conn.sendMessage(from, {text, mentions}, {quoted: mek})

        // ANTI-LINK
        if(isGroup && DATA.antilink[from] && body && containsLink(body) &&!isWhitelisted(body, from)){
            if(!(await getAdmin(conn, from, conn.user.id))) return reply('❌ Je dois être admin.')
            if(await getAdmin(conn, from, sender)) return
            setTimeout(()=>conn.sendMessage(from, {delete: mek.key}), 200)
            DATA.warns[from] = DATA.warns[from] || {}
            DATA.warns[from][sender] = (DATA.warns[from][sender] || 0) + 1
            const warns = DATA.warns[from][sender]; save('warns')
            if(OWNER) conn.sendMessage(OWNER, {text: `⚠️ [${from.split('@')[0]}] @${sender.split('@')[0]} Warn ${warns}/3`, mentions:[sender]})
            if(warns >= 3){
                await conn.groupParticipantsUpdate(from, [sender], 'remove')
                reply(`🚫 @${sender.split('@')[0]} expulsé. 3/3 warns`, [sender])
                DATA.warns[from][sender] = 0; save('warns')
            } else reply(`⚠️ @${sender.split('@')[0]} Lien interdit!\nWarn: ${warns}/3`, [sender])
            return
        }

        // ANTI-MOT
        if(isGroup && DATA.antimot[from]?.enabled && body){
            if(DATA.antimot[from].words.some(w => body.toLowerCase().includes(w.toLowerCase()))){
                if(!(await getAdmin(conn, from, sender))) setTimeout(()=>conn.sendMessage(from, {delete: mek.key}), 200)
                return reply(`🚫 @${sender.split('@')[0]} Mot interdit!`, [sender])
            }
        }

        // COMMANDES
        if(!body.startsWith(PREFIX)) return
        const [command,...args] = body.slice(1).split(' ')
        const q = args.join(' ')
        const isAdmin = isGroup? await getAdmin(conn, from, sender) : false
        const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || []

        // ANTILINK
        if(command === 'antilink'){
            if(!isAdmin) return reply('❌ Admin seulement')
            DATA.antilink[from] = q === 'on'; save('antilink')
            return reply(q === 'on'? '✅ ANTILINK Activé' : '🔴 ANTILINK Désactivé')
        }

        // WHITELIST
        if(command === 'whitelist'){
            if(!isAdmin) return reply('❌ Admin seulement')
            DATA.whitelist[from] = DATA.whitelist[from] || []
            if(args[0] === 'add'){ DATA.whitelist[from].push(args[1]); save('whitelist'); return reply(`✅ ${args[1]} ajouté`) }
            if(args[0] === 'del'){ DATA.whitelist[from] = DATA.whitelist[from].filter(d => d!== args[1]); save('whitelist'); return reply(`✅ ${args[1]} supprimé`) }
            return reply(`📋 Whitelist:\n${DATA.whitelist[from].join('\n') || 'Vide'}`)
        }

        // ANTIMOT
        if(command === 'antimot'){
            if(!isAdmin) return reply('❌ Admin seulement')
            DATA.antimot[from] = DATA.antimot[from] || {enabled: false, words: []}
            if(args[0] === 'on'){ DATA.antimot[from].enabled = true; save('antimot'); return reply('✅ ANTIMOT Activé') }
            if(args[0] === 'off'){ DATA.antimot[from].enabled = false; save('antimot'); return reply('🔴 ANTIMOT Désactivé') }
            if(args[0] === 'add'){ DATA.antimot[from].words.push(args[1]); save('antimot'); return reply(`✅ Mot "${args[1]}" ajouté`) }
            return reply(`📋 Mots: ${DATA.antimot[from].words.join(', ') || 'Vide'}`)
        }

        // WELCOME
        if(command === 'welcome'){
            if(!isAdmin) return reply('❌ Admin seulement')
            DATA.welcome[from] = DATA.welcome[from] || {enabled: false, welcome: 'Bienvenue @user', goodbye: '@user est parti'}
            if(args[0] === 'on'){ DATA.welcome[from].enabled = true; save('welcome'); return reply('✅ WELCOME Activé') }
            if(args[0] === 'off'){ DATA.welcome[from].enabled = false; save('welcome'); return reply('🔴 WELCOME Désactivé') }
            if(args[0] === 'set'){ DATA.welcome[from].welcome = q.replace('set ',''); save('welcome'); return reply('✅ Welcome défini') }
            if(args[0] === 'goodbye'){ DATA.welcome[from].goodbye = q.replace('goodbye ',''); save('welcome'); return reply('✅ Goodbye défini') }
        }

        // TAGALL
        if(command === 'tagall'){
            if(!isAdmin) return reply('❌ Admin seulement')
            const metadata = await conn.groupMetadata(from)
            const participants = metadata.participants.map(p => p.id)
            let text = `📢 *TAGALL* \n\n${q || 'Attention tout le monde'}\n\n`
            participants.forEach(p => text += `• @${p.split('@')[0]}\n`)
            return conn.sendMessage(from, {text, mentions: participants})
        }

        // VV - VOIR VUE UNIQUE
        if(command === 'vv'){
            if(!mek.message.extendedTextMessage?.contextInfo?.quotedMessage) return reply('❌ Réponds à une photo/vidéo "vue unique"')
            const quoted = mek.message.extendedTextMessage.contextInfo.quotedMessage
            const type = Object.keys(quoted)[0]
            if(!['imageMessage','videoMessage'].includes(type)) return reply('❌ Ce n\'est pas une image/vidéo')
            const stream = await downloadContentFromMessage(quoted[type], type === 'imageMessage'? 'image' : 'video')
            let buffer = Buffer.from([])
            for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk])
            await conn.sendMessage(from, { [type === 'imageMessage'? 'image' : 'video']: buffer }, {quoted: mek})
        }

        // KICK
        if(command === 'kick'){
            if(!isAdmin) return reply('❌ Admin seulement')
            const target = mentioned[0]
            if(!target) return reply('❌ Mentionne un membre')
            await conn.groupParticipantsUpdate(from, [target], 'remove')
            return reply(`🚫 @${target.split('@')[0]} expulsé`, [target])
        }

        // WARNS
        if(command === 'warns'){
            const target = mentioned[0] || sender
            const warns = DATA.warns[from]?.[target] || 0
            return reply(`⚠️ @${target.split('@')[0]}: ${warns}/3 warns`, [target])
        }

        if(command === 'resetwarn'){
            if(!isAdmin) return reply('❌ Admin seulement')
            const target = mentioned[0]
            if(!target) return reply('❌ Mentionne un membre')
            DATA.warns[from][target] = 0; save('warns')
            return reply(`✅ Warns de @${target.split('@')[0]} reset`, [target])
        }

        // MENU
        if(command === 'menu'){
            return reply(`╭━━〔 ${BOTNAME} ${VERSION} 〕━━╮
┃
┃ 🔗.antilink on/off
┃ 📋.whitelist add/del/list
┃ 🚫.antimot on/off/add/list
┃ 👋.welcome on/off/set/goodbye
┃ 📢.tagall [texte]
┃ 👁️.vv - répond à vue unique
┃ ⚠️.warns @ |.resetwarn @
┃ 👢.kick @
┃ 📜.menu
┃
╰━━━━━━━━━━╯`)
        }
    })
}
startBot().catch(console.log)
