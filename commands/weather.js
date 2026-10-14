const { add } = require('../core/registry');
const cfg = require('../core/config');
const { getJson, firstOk } = require('../lib/util');

const WMO = { 0: ['☀️', 'Ciel dégagé'], 1: ['🌤️', 'Plutôt dégagé'], 2: ['⛅', 'Partiellement nuageux'], 3: ['☁️', 'Couvert'], 45: ['🌫️', 'Brouillard'], 48: ['🌫️', 'Brouillard givrant'],
  51: ['🌦️', 'Bruine légère'], 53: ['🌦️', 'Bruine'], 55: ['🌦️', 'Bruine forte'], 61: ['🌧️', 'Pluie légère'], 63: ['🌧️', 'Pluie'], 65: ['🌧️', 'Forte pluie'],
  71: ['🌨️', 'Neige légère'], 73: ['🌨️', 'Neige'], 75: ['❄️', 'Forte neige'], 80: ['🌦️', 'Averses'], 81: ['🌧️', 'Averses fortes'], 82: ['⛈️', 'Averses violentes'],
  95: ['⛈️', 'Orage'], 96: ['⛈️', 'Orage avec grêle'], 99: ['⛈️', 'Orage violent avec grêle'] };
const wmo = c => WMO[c] || WMO[Object.keys(WMO).map(Number).filter(k => k <= c).pop()] || ['🌡️', 'Conditions variables'];
const day = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' });

// Source principale : Open-Meteo (gratuit, sans clé)
async function openMeteo(city) {
  const g = await getJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr`);
  const p = g.results?.[0];
  if (!p) throw new Error('ville introuvable');
  const w = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,pressure_msl&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=4`);
  const c = w.current, d = w.daily;
  const [ico, desc] = wmo(c.weather_code);
  let t = `${ico} *Météo — ${p.name}${p.country ? ', ' + p.country : ''}*\n\n🌡️ Température : *${Math.round(c.temperature_2m)}°C* (ressenti ${Math.round(c.apparent_temperature)}°C)\n☁️ Ciel : *${desc}*\n💧 Humidité : *${c.relative_humidity_2m}%*\n💨 Vent : *${Math.round(c.wind_speed_10m)} km/h*\n🧭 Pression : *${Math.round(c.pressure_msl)} hPa*\n\n📅 *Prévisions*`;
  for (let i = 1; i < d.time.length; i++) t += `\n${wmo(d.weather_code[i])[0]} ${day(d.time[i])} : ${Math.round(d.temperature_2m_min[i])}° / ${Math.round(d.temperature_2m_max[i])}° — pluie ${d.precipitation_probability_max[i] ?? 0}%`;
  return t;
}

// Secours : wttr.in
async function wttr(city) {
  const w = await getJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1&lang=fr`);
  const c = w.current_condition?.[0];
  if (!c) throw new Error('ville introuvable');
  const area = w.nearest_area?.[0];
  const name = area?.areaName?.[0]?.value || city;
  const desc = c.lang_fr?.[0]?.value || c.weatherDesc?.[0]?.value || '';
  return `🌡️ *Météo — ${name}${area?.country?.[0]?.value ? ', ' + area.country[0].value : ''}*\n\n🌡️ Température : *${c.temp_C}°C* (ressenti ${c.FeelsLikeC}°C)\n☁️ Ciel : *${desc}*\n💧 Humidité : *${c.humidity}%*\n💨 Vent : *${c.windspeedKmph} km/h*\n🧭 Pression : *${c.pressure} hPa*`;
}

add({ name: 'weather', alias: ['meteo'], cat: 'general', desc: 'météo d\'une ville', use: 'weather <ville>', async run(ctx) {
  if (!ctx.q) return ctx.reply('🌦️ Utilise : *weather Conakry*');
  const text = await firstOk([() => openMeteo(ctx.q), () => wttr(ctx.q)]);
  await ctx.reply(`${text}\n\n> ${cfg.BRAND} 🇬🇳`);
} });
