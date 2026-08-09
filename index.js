const { default: makeWASocket, useMultiFileAuthState, Browsers, DisconnectReason, fetchLatestBaileysVersion, downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const fetch = require('node-fetch')
const pino = require('pino')

const PREFIX = '.'
const OWNER = '𝐌𝐄𝐓𝐀'
const BOTNAME = ' *===META JEADY===* '
const VERSION = ' *v2.6.6* '
const SIGNATURE = '© 2026 META JEADY'
const GROQ_KEY = 'COLLE_TA_CLE_ICI'
const LOGO_PATH = './logo.jpg'

let ANTILINK = {}
let WARNINGS = {}
let AUTOAI = {}
let WELCOME = {}

process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err))

const getSquichyMenu = () => `╭═══════════════╮
║ ⚡ ${BOTNAME} ⚡
║═══════════════║
║ 👑 *OWNER* : ${OWNER}
║ 📦 *VERSION* : ${VERSION}
║ 🔖 *PREFIX* : ${PREFIX}
║ 🌍 *MODE* : Public
╰═══════════════╯

╭───「 *🔋ADMIN* GROUPE 」───╮
│ • ${PREFIX}open → ouvrir le groupe
│ • ${PREFIX}close → fermer le groupe
│ • ${PREFIX}kick @tag
│ • ${PREFIX}tagall
│ • ${PREFIX}invite
│ • ${PREFIX}antilink on/off
│ • ${PREFIX}autoai on/off
╰────────────────────────╯

╭───「 *⚙️OUTILS* 」───╮
│ • ${PREFIX}vv
│ • ${PREFIX}aiimg prompt
╰─────────────────╯

╭───「 *🤖 IA* 」───╮
│ • ${PREFIX}ai question
╰─────────────╯

╭─ ${SIGNATURE} ─╮`

async function sendMenu(conn, from, mek, menuText) {
    if (fs.existsSync(LOGO_PATH)) {
        await conn.sendMessage(from, { image: fs.readFileSync(LOGO_PATH), caption: menuText }, { quoted: mek }).catch(() => conn.sendMessage(from, { text: menuText }, { quoted: mek }))
    } else {
        await conn.sendMessage(from, { text: menuText }, { quoted: mek })
    }
}

async function getAIResponse(text) {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: `Tu es ${BOTNAME}.` }, { role: "user", content: text }], max_tokens: 200 })
        })
        const data = await res.json()
        return data.choices?.[0]?.message?.content || "Je n'ai pas de réponse 😅"
    } catch (e) { return "Erreur API Groq 😅" }
}

async function generateImage(prompt) {
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&model=flux`
    const res = await fetch(url)
    return await res.buffer()
}

async function isAdmin(conn, from, sender) {
    try {
        const meta = await conn.groupMetadata(from)
        return meta.participants.some(p => p.id === sender && (p.admin === 'admin' || p.admin === 'superadmin'))
    } catch { return false }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./session')
    const { version } = await fetchLatestBaileysVersion()
    const conn = makeWASocket({ version, auth: state, browser: Browsers.windows('Chrome'), printQRInTerminal: true, logger: pino({ level: 'silent' }) })
    conn.ev.on('creds.update', saveCreds)

    conn.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update
        if (qr) qrcode.generate(qr, { small: true })
        if (connection === 'open') console.log(`✅ ${BOTNAME} ${VERSION} CONNECTÉ`)
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) setTimeout(startBot, 3000)
        }
    })

    conn.ev.on('messages.upsert', async (m) => {
        if (!m.messages?.[0]?.message) return
        const mek = m.messages[0]
        const from = mek.key.remoteJid
        const sender = mek.key.participant || mek.key.remoteJid
        const isGroup = from.endsWith('@g.us')
        const body = mek.message.conversation || mek.message.extendedTextMessage?.text || ''
        const isCmd = body.startsWith(PREFIX)
        const command = isCmd? body.slice(PREFIX.length).trim().split(' ')[0].toLowerCase() : ''
        const q = isCmd? body.slice(PREFIX.length + command.length).trim() : ''
        const reply = (text, mentions = []) => conn.sendMessage(from, { text, mentions }, { quoted: mek })

        // ===== AUTO AI CORRIGÉ =====
        if (isGroup && AUTOAI[from] &&!isCmd && body.length > 2) {
            await conn.sendPresenceUpdate('composing', from)
            const aiReply = await getAIResponse(body)
            await conn.sendMessage(from, { text: aiReply }, { quoted: mek })
        }

        // ===== COMMANDES =====
        if (command === 'open') {
            if (!isGroup) return reply('❌ Groupe seulement')
            if (!await isAdmin(conn, from, sender)) return reply('❌ Toi ou le bot n\'êtes pas admin')
            if (!await isAdmin(conn, from, conn.user.id)) return reply('❌ Le bot doit être admin pour faire ça')
            try {
                await conn.groupSettingsUpdate(from, 'not_announcement')
                reply('✅ GROUPE OUVERT 🟢\nTout le monde peut parler')
            } catch (e) { reply('❌ Erreur: ' + e.message) }
        }
        else if (command === 'close') {
            if (!isGroup) return reply('❌ Groupe seulement')
            if (!await isAdmin(conn, from, sender)) return reply('❌ Toi ou le bot n\'êtes pas admin')
            if (!await isAdmin(conn, from, conn.user.id)) return reply('❌ Le bot doit être admin pour faire ça')
            try {
                await conn.groupSettingsUpdate(from, 'announcement')
                reply('🔒 GROUPE FERMÉ 🔴\nSeuls les admins peuvent parler')
            } catch (e) { reply('❌ Erreur: ' + e.message) }
        }
        else if (command === 'autoai') {
            if (!isGroup) return reply('❌ Groupe seulement')
            if (!await isAdmin(conn, from, sender)) return reply('❌ Admin seulement')
            AUTOAI[from] = q === 'on'
            reply(`✅ AutoAI : ${q === 'on'? 'ON 🟢 Le bot va répondre à tout' : 'OFF 🔴'}`)
        }
        else if (command === 'invite') {
            if (!isGroup) return reply('❌ Groupe seulement')
            const meta = await conn.groupMetadata(from)
            const code = await conn.groupInviteCode(from)
            const link = `https://chat.whatsapp.com/${code}`
            let text = `╭══════════╮
┃─────((✧ INVITATION GROUPE ✧))─────
┃
┃ ➟ *${meta.subject}*
┃ ➟ Membres: ${meta.participants.length}
┃
┃ 📢 AIDEZ-NOUS À GRANDIR!
┃ Partagez ce lien avec vos amis 👇
┃
┃ ${link}
╰══════════╯`
            await conn.sendMessage(from, { text }, { quoted: mek })
        }
        else if (command === 'aiimg') {
            if (!q) return reply(`Exemple : ${PREFIX}aiimg un lion`)
            reply(`🎨 Génération...`)
            const imgBuffer = await generateImage(q)
            await conn.sendMessage(from, { image: imgBuffer, caption: `Prompt: ${q}` }, { quoted: mek })
        }
        else if (command === 'tagall') {
            if (!isGroup) return reply('❌ Groupe seulement')
            const meta = await conn.groupMetadata(from)
            const members = meta.participants.map(p => p.id)
            let text = `╭───「 📎TAG ALL 」───╮\n│ GROUPE : ${meta.subject}\n│ TOTAL : ${members.length}\n╰─────────────────╯\n\n`
            for(let mem of members){ text += `➥ @${mem.split('@')[0]}\n` }
            await conn.sendMessage(from, { text, mentions: members }, { quoted: mek })
        }
        else if (command === 'bot-menu' || command === 'menu') await sendMenu(conn, from, mek, getSquichyMenu())
        else if (command === 'ping') {
            const start = Date.now()
            const msg = await reply('🏓 Pong...')
            await conn.sendMessage(from, { text: `🏓 Pong! ${Date.now() - start}ms`, edit: msg.key })
        }
        else if (command === 'ai') {
            if (!q) return reply(`Usage : ${PREFIX}ai ta question`)
            const aiReply = await getAIResponse(q)
            await conn.sendMessage(from, { text: aiReply }, { quoted: mek })
        }
    })
}

startBot()
