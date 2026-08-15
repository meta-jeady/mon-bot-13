const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')

const PREFIX = '.'
const OWNER = 'KČØ4P'
const BOTNAME = 'META JEADY'
const VERSION = 'v2.6.4'
const SIGNATURE = '> BY : © 2026 KČØ4P TECH'

const LOGO_PATH = './logo.jpg'
const PING_BANNIERE = 'https://i.ibb.co/0yXk3vL/ping-banner.jpg'

const format = (text) => '> ' + text.split('\n').join('\n> ')

const getMenu = () => format(`╭══════════════════╮
┃─────((✧ ${BOTNAME} ✧))─────
┃
┃ ➟ OWNER: ${OWNER}
┃ ➟ VERSION: ${VERSION}
┃ ➟ PREFIX: ${PREFIX}
┃ ➟ COMMAND: 10
┃ ➟ DATE: ${new Date().toLocaleDateString('fr-FR')}
┃ ➟ MODE: 🌍 Public
┃
╰══════════════════╯

╭──((✧ SYSTEME ✧))──╮
┃ ➟ ${PREFIX}menu
┃ ➟ ${PREFIX}ping
┃ ➟ ${PREFIX}info
╰───────────────────╯

╭──((✧ ADMIN ✧))──╮
┃ ➟ ${PREFIX}open
┃ ➟ ${PREFIX}close
┃ ➟ ${PREFIX}kick @tag
┃ ➟ ${PREFIX}tagall
┃ ➟ ${PREFIX}welcome on/off
╰──────────────────╯

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
        const { connection, lastDisconnect } = update

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
