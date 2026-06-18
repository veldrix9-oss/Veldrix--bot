require('dotenv').config({ path: './config.env' });
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

// ---------- CONFIG ----------
const PORT = process.env.WEB_PORT || 3000;
const SESSION_FOLDER = './session';
const PREFIX = process.env.PREFIX || '!';
const OWNER = process.env.OWNER_NUMBER || '255748529340';

// ---------- EXPRESS ----------
const app = express();
app.use(express.json());

let sock = null;
let isConnected = false;
let startTime = Date.now();
let pairingAttempted = false;
let reconnectTimeout = null;

// ---------- CONNECT FUNCTION ----------
async function connectToWhatsApp() {
    console.log('🔄 Starting WhatsApp connection...');

    // Ensure session folder exists
    if (!fs.existsSync(SESSION_FOLDER)) {
        fs.mkdirSync(SESSION_FOLDER);
    }

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_FOLDER);

    // --- Fetch latest WhatsApp version ---
    const { version } = await fetchLatestBaileysVersion();
    console.log(`✅ Using Baileys version: ${version.join('.')}`);

    sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        version: version,
        logger: pino({ level: 'silent' }),
        browser: ['VELDRIX-BOT', 'Chrome', '120.0.0'],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;

        // --- Handle Pairing Code ---
        if ((connection === 'connecting' || update.qr) && !state.creds.registered && !pairingAttempted) {
            pairingAttempted = true;
            console.log('🔑 Socket is ready. Requesting pairing code...');
            const phoneNumber = OWNER.replace(/\D/g, '');

            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`📱 Your pairing code: ${code}`);
                console.log('👉 Open WhatsApp → Linked Devices → Link with phone number, enter this code.');
            } catch (err) {
                console.error('❌ Pairing code request failed:', err.message);
                pairingAttempted = false; // allow retry
            }
        }

        // --- Handle Connection Close ---
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            isConnected = false;
            console.log(`❌ Connection closed. Code: ${statusCode || 'unknown'}`);

            // If logged out (401), delete session and restart fresh
            if (statusCode === DisconnectReason.loggedOut) {
                console.log('🔄 Session invalid (logged out). Deleting session and reconnecting...');
                try {
                    fs.rmSync(SESSION_FOLDER, { recursive: true, force: true });
                } catch (e) {}
                // Reset pairing flag and reconnect without exiting
                pairingAttempted = false;
                clearTimeout(reconnectTimeout);
                reconnectTimeout = setTimeout(() => connectToWhatsApp(), 5000);
            } else {
                // For other errors, just reconnect
                pairingAttempted = false;
                clearTimeout(reconnectTimeout);
                reconnectTimeout = setTimeout(() => connectToWhatsApp(), 10000);
            }
        }

        // --- Handle Successful Connection ---
        if (connection === 'open') {
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
        try {
            await sock.sendMessage(sender, { text: txt });
        } catch (err) {
            console.error('❌ Failed to send message:', err.message);
        }
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

// ---------- START ----------
app.listen(PORT, () => {
    console.log(`🌐 Web dashboard running on port ${PORT}`);
});

// Start the bot and catch any unhandled errors
connectToWhatsApp().catch(err => {
    console.error('❌ Unhandled error in connectToWhatsApp:', err);
    // Retry after 10 seconds
    setTimeout(() => connectToWhatsApp(), 10000);
});
