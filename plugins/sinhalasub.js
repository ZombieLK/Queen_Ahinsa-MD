// 🎬 SinhalaSub Movie & TV Search + Download
const consoleLog = console.log;
const config = require('../config');
const { cmd } = require('../command');
const axios = require('axios');
const NodeCache = require('node-cache');

// Cache
const searchCache = new NodeCache({ stdTTL: 60, checkperiod: 120 });
const BRAND = '' + config.MOVIE_FOOTER;
const API_KEY = '8b351aea3c309f07eaa84ec1db41900acad5bf239e172fcfe04082c2666e86b0'; // 🗝️ Your SinhalaSub API key

// Base API endpoints
const API_BASE = 'https://foreign-marna-sithaunarathnapromax-9a005c2e.koyeb.app/api/cinesubz';

cmd({
  pattern: 'sinhalasub',
  react: '🎬',
  desc: 'Search and Download Movies / TV Series from SinhalaSub',
  category: 'Movie / TV',
  filename: __filename
}, async (client, quotedMsg, msg, { from, q }) => {

  const HELP_TEXT =
    '*🎬 SinhalaSub Movie / TV Search*\n\n' +
    '🕵️ Usage: `.sinhalasub <movie name>`\n\n' +
    '📺 Example: `.sinhalasub Venom 3`\n\n' +
    '🔍 Type your movie or series name to begin.';

  if (!q) return await client.sendMessage(from, { text: HELP_TEXT }, { quoted: quotedMsg });

  try {
    const cacheKey = `sinhalasub_${q.toLowerCase()}`;
    let data = searchCache.get(cacheKey);

    if (!data) {
      const searchUrl = `${API_BASE}/search?q=${encodeURIComponent(q)}&apiKey=${API_KEY}`;
      const res = await axios.get(searchUrl, { timeout: 15000 });
      data = res.data;

      if (!data || !data.results || !Array.isArray(data.results))
        throw new Error('❌ No results found.');

      searchCache.set(cacheKey, data);
    }

    const results = data.results.map((m, i) => ({
      n: i + 1,
      title: m.title,
      year: m.year,
      type: m.type, // movie or tv
      link: m.url,
      image: m.image
    }));

    let caption = `*🎬 SinhalaSub Search Results*\n\n`;
    results.forEach(r => {
      caption += `${r.n}. ${r.title} (${r.year || 'N/A'}) • [${r.type.toUpperCase()}]\n\n`;
    });
    caption += '📌 Reply with number (1, 2, etc.) to select.\n\n*~https://whatsapp.com/channel/0029Vb5xFPHGE56jTnm4ZD2k~*';

    const sentMsg = await client.sendMessage(from, {
      image: { url: results[0].image },
      caption
    }, { quoted: quotedMsg });

    const pending = new Map();

    const handleUpsert = async ({ messages }) => {
      const m = messages?.[0];
      if (!m || !m.message?.conversation) return;
      const text = m.message.conversation.trim();
      if (text === '0') {
        client.ev.removeListener('messages.upsert', handleUpsert);
        await client.sendMessage(from, { text: 'Cancelled ✅' }, { quoted: m });
        return;
      }

      // if reply to search result
      if (m.message?.contextInfo?.stanzaId === sentMsg.key.id) {
        const num = parseInt(text);
        const selected = results.find(r => r.n === num);
        if (!selected) {
          await client.sendMessage(from, { text: '❌ Invalid selection.' }, { quoted: m });
          return;
        }

        // Choose correct info endpoint based on type
        let infoUrl;
        if (selected.type === 'movie') {
          infoUrl = `${API_BASE}/infodl?q=${encodeURIComponent(selected.link)}&apiKey=${API_KEY}`;
        } else {
          infoUrl = `${API_BASE}/tv/info?q=${encodeURIComponent(selected.link)}&apiKey=${API_KEY}`;
        }

        const infoRes = await axios.get(infoUrl, { timeout: 15000 });
        const info = infoRes.data;

        if (!info) {
          await client.sendMessage(from, { text: '❌ No details found.' }, { quoted: m });
          return;
        }

        // If it's a TV show -> list episodes
        if (selected.type === 'tv') {
          if (!info.episodes || !info.episodes.length) {
            await client.sendMessage(from, { text: '❌ No episodes found.' }, { quoted: m });
            return;
          }

          let epText = `*📺 ${selected.title}*\n\nChoose an episode:\n\n`;
          info.episodes.forEach((e, i) => {
            epText += `${i + 1}. ${e.title}\n`;
          });
          epText += '\n🔢 Reply with number to download.\n\n*~https://whatsapp.com/channel/0029Vb5xFPHGE56jTnm4ZD2k~*';

          const epMsg = await client.sendMessage(from, {
            image: { url: selected.image },
            caption: epText
          }, { quoted: m });

          pending.set(epMsg.key.id, { type: 'episode', data: info.episodes, parent: selected });
          return;
        }

        // Movie => direct download links
        sendDownloadChoices(client, from, m, info, selected);
      }

      // Handle episode selection
      if (pending.has(m.message?.contextInfo?.stanzaId)) {
        const { type, data, parent } = pending.get(m.message.contextInfo.stanzaId);
        if (type !== 'episode') return;
        const epIndex = parseInt(text) - 1;
        const ep = data[epIndex];
        if (!ep) {
          await client.sendMessage(from, { text: '❌ Invalid episode number.' }, { quoted: m });
          return;
        }

        // Episode download info
        const dlUrl = `${API_BASE}/tv/dl?q=${encodeURIComponent(ep.url)}&apiKey=${API_KEY}`;
        const dlRes = await axios.get(dlUrl, { timeout: 15000 });
        const dl = dlRes.data;
        sendDownloadChoices(client, from, m, dl, ep, parent.title);
      }
    };

    client.ev.on('messages.upsert', handleUpsert);

  } catch (err) {
    consoleLog(err);
    await client.sendMessage(from, { text: '❌ Error: ' + (err.message || err) }, { quoted: quotedMsg });
  }
});

async function sendDownloadChoices(client, from, msg, info, movie, parentTitle = '') {
  const links = info.download || info.sources || [];
  if (!Array.isArray(links) || !links.length) {
    await client.sendMessage(from, { text: '❌ No download links.' }, { quoted: msg });
    return;
  }

  let text = `🎬 *${parentTitle || movie.title}*\n\nSelect quality:\n\n`;
  links.forEach((l, i) => {
    text += `${i + 1}. *${l.quality || 'Unknown'}* - ${l.size || 'N/A'}\n`;
  });
  text += '\n📥 Reply with number to get the direct download link.\n\n' + BRAND;

  const qualityMsg = await client.sendMessage(from, {
    image: { url: movie.image },
    caption: text
  }, { quoted: msg });

  const handleQuality = async ({ messages }) => {
    const m = messages?.[0];
    if (!m || !m.message?.conversation) return;
    if (m.message?.contextInfo?.stanzaId !== qualityMsg.key.id) return;

    const num = parseInt(m.message.conversation);
    const selected = links[num - 1];
    if (!selected) {
      await client.sendMessage(from, { text: '❌ Invalid number.' }, { quoted: m });
      return;
    }

    await client.sendMessage(from, {
      text: `✅ *Download link:*\n${selected.url || selected.direct_download}\n\n${BRAND}`
    }, { quoted: m });

    client.ev.removeListener('messages.upsert', handleQuality);
  };

  client.ev.on('messages.upsert', handleQuality);
}
