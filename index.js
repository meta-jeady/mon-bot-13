const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, delay } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const pino = require('pino')
const fs = require('fs')

const PREFIX = '.'
const OWNER = 'KČØ4P'
const BOTNAME = 'META JEADY'
const VERSION = 'v2.6.4'
const SIGNATURE = '> BY : _© 2026 KČØ4P TECH_'

const LOGO_PATH = './logo.jpg'
const PING_BANNIERE = 'https://i.imgur.com/8KmE1wD.jpg'

// ===== ANTILINK SYSTEM =====
let antiLink = {} // stocke les groupes avec antilink on

const format = (text) => '> ' + text.split('\n').join('\n> ')

const getMenu = () => format(`╭─❒ 「 ${BOTNAME} 」 ❒
│
│ 👑 OWNER : ${OWNER}
│ 📦 VERSION : ${VERSION}
│ ⚡ PREFIX : ${PREFIX}
│ 📊 COMMANDES : 11
│ 🌍 MODE : Public
│ 📅 DATE : ${new Date().toLocaleDateString('fr-FR')}
│
╰──────────────❒

╭─❒ 「 SYSTEME 」 ❒
│ ➟ ${PREFIX}menu
│ ➟ ${PREFIX}ping
│ ➟ ${PREFIX}info
╰──────────────❒

╭─❒ 「 ADMIN GROUPE 」 ❒
│ ➟ ${PREFIX}open _ouvrir le groupe_
│ ➟ ${PREFIX}close _fermer le groupe_
│ ➟ ${PREFIX}kick @tag _expulser un membre_
│ ➟ ${PREFIX}tagall _taguer tout le monde_
│ ➟ ${PREFIX}welcome on/off _msg bienvenue_
│ ➟ ${PREFIX}antilink on/off _anti lien wa_
╰──────────────❒

${SIGNATURE}`)

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const { version } = await fetchLatestBaileysVersion()

    const conn = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        browser: ['Ubuntu', 'Chrome', '120.0.0'],
        logger: pino({ level: 'fatal' })
    })

    conn.ev.on('creds.update', saveCreds)

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if(qr) {
            console.log('\n====== SCANNE CE QR AVEC WHATSAPP ======\n')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'open') console.log(`\n✅ ${BOTNAME} CONNECTÉ AVEC SUCCES ✅\n`)
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
            console.log('Déconnecté. Reconnexion...')
            if (shouldReconnect) startBot()
        }
    })

    conn.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages[0]) return
        const mek = messages[0]
        const from = mek.key.remoteJid
        const body = mek.message?.conversation || mek.message?.extendedTextMessage?.text || ''
        const isGroup = from.endsWith('@g.us')
        const sender = mek.key.participant || mek.key.remoteJid

        // ===== ANTILINK CHECK =====
        if(isGroup && antiLink[from]) {
            const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i
            if(linkRegex.test(body)) {
                try {
                    const groupMeta = await conn.groupMetadata(from)
                    const botId = conn.user.id.split(':')[0] + '@s.whatsapp.net'
                    const isBotAdmin = groupMeta.participants.find(p => p.id === botId)?.admin
                    const isSenderAdmin = groupMeta.participants.find(p => p.id === sender)?.admin

                    if(isBotAdmin &&!isSenderAdmin) {
                        await conn.sendMessage(from, { delete: mek.key })
                        await conn.groupParticipantsUpdate(from, [sender], "remove")
                        await conn.sendMessage(from, { text: format(`❌ Lien WhatsApp détecté!\n@${sender.split('@')[0]} a été expulsé`), mentions: [sender] })
                        return
                    }
                } catch(e) { console.log(e) }
            }
        }

        if (!body.startsWith(PREFIX)) return

        const command = body.slice(1).trim().split(' ')[0].toLowerCase()
        const q = body.slice(1 + command.length).trim()
        const reply = (text) => conn.sendMessage(from, { text: format(text) }, { quoted: mek })

        if (command === 'menu') {
            if (fs.existsSync(LOGO_PATH)) {
                await conn.sendMessage(from, { image: fs.readFileSync(LOGO_PATH), caption: getMenu() }, { quoted: mek })
            } else {
                reply(getMenu())
            }
        }

        else if (command === 'ping') {
            const start = Date.now()
            await delay(100)
            const end = Date.now()
            try {
                await conn.sendMessage(from, { image: { url: PING_BANNIERE }, caption: format(`🏓 Pong! ${end - start}ms`) }, { quoted: mek })
            } catch {
                reply(`🏓 Pong! ${end - start}ms\n✅ ${BOTNAME} est en ligne`)
            }
        }

        else if (command === 'info') {
            if (fs.existsSync(LOGO_PATH)) {
                await conn.sendMessage(from, { image: fs.readFileSync(LOGO_PATH), caption: format(`*${BOTNAME} ${VERSION}*\nCréé par ${OWNER}\n24/24 Online\n${SIGNATURE}`) }, { quoted: mek })
            } else {
                reply(`*${BOTNAME} ${VERSION}*\nCréé par ${OWNER}\n${SIGNATURE}`)
            }
        }

        else if (command === 'antilink') {
            if(!isGroup) return reply('❌ Commande groupe seulement')
            const groupMeta = await conn.groupMetadata(from)
            const isSenderAdmin = groupMeta.participants.find(p => p.id === sender)?.admin
            if(!isSenderAdmin) return reply('❌ Admin seulement')

            if (q === 'on') {
                antiLink[from] = true
                reply('✅ ANTILINK ACTIVÉ\nLes liens whatsapp sont interdits. Kick auto.')
            }
            else if (q === 'off') {
                delete antiLink[from]
                reply('❌ ANTILINK DÉSACTIVÉ')
            }
            else reply(`Usage : ${PREFIX}antilink on/off`)
        }

        else if (command === 'welcome') {
            if (q === 'on') reply('✅ WELCOME ACTIVÉ')
            else if (q === 'off') reply('❌ WELCOME DÉSACTIVÉ')
            else reply(`Usage : ${PREFIX}welcome on/off`)
        }

        else if (command === 'open') {
            await conn.groupSettingUpdate(from, 'not_announcement')
            reply('✅ GROUPE OUVERT')
        }

        else if (command === 'close') {
            await conn.groupSettingUpdate(from, 'announcement')
            reply('🔒 GROUPE FERMÉ')
        }

        else if (command === 'kick') {
            const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid || []
            if (mentioned.length === 0) return reply(`Usage : ${PREFIX}kick @membre`)
            await conn.groupParticipantsUpdate(from, mentioned, "remove")
            reply('✅ Membre expulsé')
        }

        else if (command === 'tagall') {
            const meta = await conn.groupMetadata(from)
            const members = meta.participants.map(p => p.id)
            let text = `╭── TAG ALL ──╮\n┃ ➟ Groupe: ${meta.subject}\n┃ ➟ Total: ${members.length}\n╰─────────────╯\n\n`
            members.forEach(mem => text += `➟ @${mem.split('@')[0]}\n`)
            await conn.sendMessage(from, { text: format(text), mentions: members }, { quoted: mek })
        }
    })
}

startBot()
