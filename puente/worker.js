/* RADIA · puente de audio para Cloudflare Workers (plan gratuito).
   Reenvía el stream de una radio agregando permiso CORS, para que RADIA pueda analizarlo y anticipar las tandas.
   Solo acepta los servidores de las radios del catálogo. Generado por tools_catalog.py + este encabezado. */
export const HOSTS = ["1063fm.ddns.net", "198.49.65.43", "24deagosto-zikoxweb.radioca.st", "27383.live.streamtheworld.com", "970universal-3.nty.uy", "a3.asurahosting.com", "america-2.nty.uy", "as100.globalhost1.com", "azul-1.nty.uy", "azul-2.nty.uy", "cento02.mipanelradio.com", "cloudstream2036.conectarhosting.com", "comodin.uy", "cordialidad-zikoxweb2.radioca.st", "cx10continente.com", "delsol-1.nty.uy", "dreamsiteradiocp.com", "emisiones.com.uy", "emisora.unorte.edu.uy", "espectador-1.nty.uy", "hit-1.nty.uy", "icecast15.innovanexo.com", "icecasthd.net", "inolvidable-1.nty.uy", "inolvidable-2.nty.uy", "medios.ciudaddigital.com.uy", "metropolis-web-1.nty.uy", "oceano-2.nty.uy", "one.cloudstreaming.eu", "panel.streamenviron.com", "playerservices.streamtheworld.com", "radio.cimaspeed.com", "radio.dl.uy", "radio.hostlagarto.com", "radio.solumedia.com.ar", "radioclarin-zikoxweb.radioca.st", "radiolatina.live", "radioonline.netgate.com.uy", "radios-online.info", "radios.iwstreaming.uy", "radios.solumedia.com", "radiosar.com", "rincon2-zikoxweb.radioca.st", "rinconam-zikoxweb.radioca.st", "rr5100.globalhost1.com", "s1.radiosenialesfm.com", "s7.myradiostream.com", "salida.stream.com.uy", "server-uk1.radioseninternet.net", "server-usa2.radioseninternet.net", "server.laradio.online", "sh1.radioonlinehd.com", "sp.dattavolt.com", "sp3.servidorrprivado.com", "srv2.radiostreamuy.com", "stm.gmpro.top", "stm1.ifantasy.com.br", "stream-151.zeno.fm", "stream-30.zeno.fm", "stream.rcast.net", "stream.zeno.fm", "stream1.enperspectiva.net", "stream20.usastreams.com", "streaming.gostreaming.com.ar", "streaming.radiosenlinea.com.ar", "streaming01.shockmedia.com.ar", "streaming1.hostingmontevideo.com", "streaming1.locucionar.com", "streaming2.locucionar.com", "streaming3.hostingmontevideo.com", "streaming6.locucionar.com", "streamingcasazorrilla.innovanexo.com", "streamingraddios.online", "streamradio.novotempo.com", "uniradio.edu.uy", "usa15.ciudaddigital.com.uy", "usa2.fastcast4u.com"];
const CORS = { 'Access-Control-Allow-Origin': '*' };
const say = (status, text) => new Response(text, { status, headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' } });
export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return say(200, 'ok');
    if (request.method !== 'GET' || url.pathname !== '/s') return say(404, 'Uso: /s?u=<stream>');
    let target; try { target = new URL(url.searchParams.get('u')); } catch (e) { return say(400, 'Dirección inválida'); }
    if (!/^https?:$/.test(target.protocol)) return say(400, 'Solo http o https');
    const extra = String(env.EXTRA_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!HOSTS.includes(target.hostname) && !extra.includes(target.hostname)) return say(403, 'Radio fuera del catálogo');
    let up;
    try { up = await fetch(target.href, { headers: { 'User-Agent': 'RADIA-puente/1.0' }, redirect: 'follow', signal: request.signal }); }
    catch (e) { return say(502, 'La radio no respondió'); }
    const type = up.headers.get('content-type') || '';
    if (!up.ok || !/^audio\/|ogg|mpegurl|aac/i.test(type)) { try { await up.body.cancel(); } catch (e) { /* ya cerrado */ } return say(502, 'El destino no es un stream de audio'); }
    return new Response(up.body, { status: 200, headers: { ...CORS, 'Content-Type': type, 'Cache-Control': 'no-store' } });
  }
};
