const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const pino = require('pino')
const fs = require('fs')

const PREFIX = '.'
const OWNER = 'KČØ4P'
const BOTNAME = 'META JEADY'
const VERSION = 'v2.6.4'
const SIGNATURE = '> BY : © 2026 KČØ4P TECH'

const LOGO_PATH = './logo.jpg'
const PING_BANNIERE = 'https://i.ibb.co/0yXk3vL/ping-banner.jpg'

// ANTILINK
let antiLink = {} // { 'groupjid': true }

const format = (text) => '> ' + text.split('\n').join('\n> ')

const getMenu = () => format(`> ╭─❒ 「 META JEADY 」 ❒
> │
> │  👑 OWNER : KČØ4P
> │  📦 VERSION : v2.6.4
> │  ⚡ PREFIX : .
> │  📊 COMMANDES : 11
> │  🌍 MODE : Public
> │  📅 DATE : 15/08/2026
> │
> ╰──────────────❒

> ╭─❒ 「 SYSTEME 」 ❒
> │ ➟ .menu
> │ ➟ .ping
> │ ➟ .info
> ╰──────────────❒

> ╭─❒ 「 ADMIN GROUPE 」 ❒
> │ ➟ .open        _ouvrir le groupe_
> │ ➟ .close       _fermer le groupe_
> │ ➟ .kick @tag   _expulser un membre_
> │ ➟ .tagall      _taguer tout le monde_
> │ ➟ .welcome on/off _msg bienvenue_
> │ ➟ .antilink on/off _anti lien wa_
> ╰──────────────❒

${SIGNATURE}`)

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const { version } = await fetchLatestBaileysVersion()

    const conn = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // ✅ QR ACTIVÉ
        browser: ['Ubuntu', 'Chrome', '120.0.0'], // Anti-ban
        logger: pino({ level: 'warn' })
    })

    conn.ev.on('creds.update', saveCreds)

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if(qr) {
            console.log('\n====== SCANNE CE QR AVEC WHATSAPP ======\n')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'open') {
            console.log(`\n✅ ${BOTNAME} CONNECTÉ AVEC SUCCES ✅\n`)
        }
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

        // ===== ANTILINK =====
        if(isGroup && antiLink[from]) {
            const linkRegex = /chat.whatsapp.com\/([0-9A-Za-z]{20,24})/i
            if(linkRegex.test(body)) {
                const groupMeta = await conn.groupMetadata(from)
                const botId = conn.user.id.split(':')[0] + '@s.whatsapp.net'
                const isBotAdmin = groupMeta.participants.find(p => p.id === botId)?.admin
                const isSenderAdmin = groupMeta.participants.find(p => p.id === sender)?.admin

                if(isBotAdmin &&!isSenderAdmin) {
                    await conn.sendMessage(from, { delete: mek.key })
                    await conn.groupParticipantsUpdate(from, [sender], "remove")
                    await conn.sendMessage(from, { text: format(`❌ Lien détecté! @${sender.split('@')[0]} a été expulsé`), mentions: [sender] })
                    return
                }
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
                reply('❌ logo.jpg introuvable. Mets le dans le dossier du bot')
            }
        }

        else if (command === 'ping') {
            const start = Date.now()
            await conn.sendMessage(from, { image: { url: PING_BANNIERE }, caption: format('🏓 Test...') }, { quoted: mek })
            const end = Date.now()
            await conn.sendMessage(from, { text: format(`🏓 Pong! ${end - start}ms\nBot: En ligne ✅`) }, { quoted: mek })
        }

        else if (command === 'info') {
            if (fs.existsSync(LOGO_PATH)) {
                await conn.sendMessage(from, { image: fs.readFileSync(LOGO_PATH), caption: format(`*${BOTNAME} ${VERSION}*\nCréé par ${OWNER}\n24/24 Online\n${SIGNATURE}`) }, { quoted: mek })
            } else {
                reply(`*${BOTNAME} ${VERSION}*\nCréé par ${OWNER}\n${SIGNATURE}`)
            }
        }

        else if (command === 'welcome') {
            if (q === 'on') reply('✅ WELCOME ACTIVÉ')
            else if (q === 'off') reply('❌ WELCOME DÉSACTIVÉ')
            else reply(`Usage : ${PREFIX}welcome on/off`)
        }

        else if (command === 'antilink') {
            if(!isGroup) return reply('❌ Commande groupe seulement')
            const groupMeta = await conn.groupMetadata(from)
            const isSenderAdmin = groupMeta.participants.find(p => p.id === sender)?.admin
            if(!isSenderAdmin) return reply('❌ Admin seulement')

            if (q === 'on') {
                antiLink[from] = true
                reply('✅ ANTILINK ACTIVÉ\nTout lien whatsapp sera supprimé + kick')
            }
            else if (q === 'off') {
                delete antiLink[from]
                reply('❌ ANTILINK DÉSACTIVÉ')
            }
            else reply(`Usage : ${PREFIX}antilink on/off`)
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
