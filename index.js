require('dotenv').config({ path: './config.env' });
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ---------- CONFIG ----------
const PORT = process.env.WEB_PORT || 3000;
const SESSION_FOLDER = './session';
const PREFIX = process.env.PREFIX || '!';
const OWNER = process.env.OWNER_NUMBER || '255748529340';

// ---------- EXPRESS SETUP ----------
const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;
let startTime = Date.now();

// ---------- SESSION MANAGEMENT ----------
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);
    
    if (process.env.SESSION_ID && process.env.SESSION_ID.length > 10) {
        try {
            const credsBuffer = Buffer.from(process.env.SESSION_ID, 'base64');
            const credsJson = JSON.parse(credsBuffer.toString());
            fs.writeFileSync(path.join(SESSION_FOLDER, 'creds.json'), JSON.stringify(credsJson, null, 2));
            console.log('✅ Session restored from SESSION_ID');
        } catch (e) {
            console.warn('⚠️ Invalid SESSION_ID, will generate new session');
        }
    }

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['VELDRIX-BOT', 'Chrome', '120.0.0'],
    });

    // ---------- PAIRING CODE ----------
    if (!state.creds.registered) {
        console.log('🔑 No session found. Generating pairing code...');
        const phoneNumber = OWNER.replace(/\D/g, '');
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`📱 Your pairing code: ${code}`);
                console.log('👉 Open WhatsApp → Linked Devices → Link with phone number, enter this code.');
            } catch (err) {
                console.error('❌ Pairing code generation failed:', err);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode;
            isConnected = false;
            console.log('❌ Connection closed. Reconnecting...');
            if (reason === DisconnectReason.loggedOut) {
                console.log('🔄 Logged out, deleting session...');
                fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
                process.exit(0);
            }
            connectToWhatsApp();
        } else if (connection === 'open') {
            isConnected = true;
            console.log('✅ Bot is online!');
        }
    });

    // ---------- MESSAGE HANDLER ----------
    sock.ev.on('messages.upsert', async (msg) => {
        const m = msg.messages[0];
        if (!m.message || m.key.fromMe) return;
        const text = m.message.conversation || m.message.extendedTextMessage?.text || '';
        const sender = m.key.remoteJid;

        if (text.startsWith(PREFIX)) {
            const cmd = text.slice(PREFIX.length).trim().toLowerCase();
            await handleCommand(cmd, sender, m);
        }
    });

    return sock;
}

// ---------- COMMAND HANDLER ----------
async function handleCommand(cmd, sender, msg) {
    const reply = async (txt) => {
        await sock.sendMessage(sender, { text: txt });
    };

    switch (cmd) {
        case 'menu':
            await reply(`╔══════════════════╗
   𝐕𝐄𝐋𝐃𝐑𝐈𝐗 𝐁𝐎𝐓
╠══════════════════╣
║ !menu - Show this ║
║ !ping - Test     ║
║ !status - Bot info║
║ !owner - Contact  ║
╚══════════════════╝`);
            break;
        case 'ping':
            await reply('🏓 Pong!');
            break;
        case 'status':
            const uptime = Math.floor((Date.now() - startTime) / 1000);
            await reply(`📊 Status:
• Bot: ${isConnected ? 'Online ✅' : 'Offline ❌'}
• Uptime: ${uptime}s
• Owner: ${OWNER}`);
            break;
        case 'owner':
            await reply(`👤 Owner: ${OWNER}`);
            break;
        default:
            break;
    }
}

// ---------- WEB SERVER ----------
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head><title>VELDRIX BOT - Status</title></head>
            <body style="background:#0d0d0d; color:#00ffcc; font-family:monospace; padding:20px;">
                <h1>🚀 VELDRIX BOT</h1>
                <p>Status: <span style="color:${isConnected ? '#00ff00' : '#ff0000'}">${isConnected ? 'ONLINE' : 'OFFLINE'}</span></p>
                <p>Uptime: ${Math.floor((Date.now() - startTime) / 1000)}s</p>
                <p>Owner: ${OWNER}</p>
                <p>Session: ${fs.existsSync(path.join(SESSION_FOLDER, 'creds.json')) ? 'Active' : 'None'}</p>
                <hr>
                <p><a href="/status" style="color:#00ffcc;">JSON Status</a></p>
                <p style="margin-top:30px; color:#888;">VELDRIX BOT © 2026</p>
            </body>
        </html>
    `);
});

app.get('/status', (req, res) => {
    res.json({
        status: isConnected ? 'online' : 'offline',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        owner: OWNER,
        session: fs.existsSync(path.join(SESSION_FOLDER, 'creds.json')),
        timestamp: new Date().toISOString()
    });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
    console.log(`🌐 Web dashboard running on port ${PORT}`);
});

// ---------- INIT BOT ----------
connectToWhatsApp().catch(console.error);
