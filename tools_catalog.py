import re, json, hashlib
lines = open('uy.m3u', encoding='utf-8').read().splitlines()
raw = []
for i, l in enumerate(lines):
    if l.startswith('#EXTINF') and i + 1 < len(lines):
        name = l.split('radio="true",', 1)[-1].strip(); url = lines[i + 1].strip()
        if url.startswith('http'): raw.append((name, url))
# nombres canónicos (clave: regex sobre nombre o url)
CANON = [
  (r'oceano', 'Océano FM', '93.9 FM'), (r'^del ?sol', 'Del Sol FM', '99.5 FM'), (r'^azul fm', 'Azul FM', '101.9 FM'),
  (r'sarandi', 'Radio Sarandí', '690 AM'), (r'espectador', 'El Espectador', '810 AM'),
  (r'radiocarve850', 'Radio Carve', '850 AM'), (r'carvedeportiva', 'Carve Deportiva', ''),
  (r'970 universal', 'Radio Universal', '970 AM'), (r'monte carlo', 'Radio Monte Carlo', '930 AM'),
  (r'^radiomundo', 'Radiomundo', '1170 AM'), (r'radio uruguay 1050', 'Radio Uruguay', '1050 AM'),
  (r'radio clarin', 'Radio Clarín', '580 AM'), (r'cl[aá]sica 650', 'Clásica 650', '650 AM'), (r'babel', 'Babel', '97.1 FM'),
  (r'emisora del sur', 'Emisora del Sur', '94.7 FM'), (r'disney', 'Radio Disney', '103.7 FM'),
  (r'^radiocero|cosquin', 'Radio Cero', '104.3 FM'), (r'metropolis', 'Metrópolis FM', '104.9 FM'), (r'alfa fm', 'Alfa FM', '96.3 FM'),
  (r'galaxia', 'Galaxia FM', '105.9 FM'), (r'fm hit', 'FM Hit', '90.3 FM'), (r'inolvidable', 'Inolvidable FM', '93.1 FM'),
  (r'pip[ií] cuc[uú]', 'Radio Pipí Cucú', ''), (r'chiveo', 'Radio Chiveo', ''), (r'felicidad', 'Radio Felicidad', '1240 AM'),
  (r'^exito', 'Éxito FM', '99.7 FM'), (r'radio oriental', 'Radio Oriental', '770 AM'), (r'radio rural', 'Radio Rural', '610 AM'),
  (r'la diaria', 'La Diaria Radio', ''), (r'futura', 'Radio Futura', '91.1 FM'), (r'aire fm', 'Aire FM', '100.3 FM'),
  (r'cx 46 radio america', 'Radio América', '1010 AM'), (r'radio maria', 'Radio María', ''), (r'cultura am', 'Radio Cultura', '1290 AM'),
  (r'continente 730', 'Radio Continente', '730 AM'), (r'la treinta|radio nacional', 'Radio Nacional (La Treinta)', '1050 AM'),
  (r'uni radio', 'Uniradio', '107.7 FM'), (r'mundo fm', 'Mundo FM', ''), (r'rincón fm|rincon fm', 'Rincón FM (Fray Bentos)', '107.7 FM'),
]
DROP = re.compile(r'onlineradiobox')
groups = {}
for name, url in raw:
    if DROP.search(url): continue
    key, cname, freq = None, None, ''
    hay = name.lower()
    for pat, cn, fq in CANON:
        if re.search(pat, hay) or re.search(pat, url.lower()):
            key, cname, freq = cn.lower(), cn, fq; break
    if not key:
        cname = re.sub(r'\s+', ' ', name).strip()
        if cname.isupper() and len(cname) > 4: cname = cname.title().replace('Fm', 'FM').replace('Am', 'AM').replace('Cx', 'CX')
        key = cname.lower()
    g = groups.setdefault(key, {'name': cname, 'freq': freq, 'urls': []})
    if url not in g['urls']: g['urls'].append(url)
out = []
for g in groups.values():
    g['urls'].sort(key=lambda u: (not u.startswith('https:'), '.m3u8' in u))
    m = re.search(r'(\d{2,3}[.,]\d)\s*(?:fm)?|(?:am\s*)?(\b\d{3,4}\b)\s*am|(\b\d{3,4}\b)', g['name'], re.I)
    if not g['freq'] and m:
        if m.group(1): g['freq'] = m.group(1).replace(',', '.') + ' FM'
        elif m.group(2): g['freq'] = m.group(2) + ' AM'
    s = {'id': 'uy-' + hashlib.md5(g['name'].lower().encode()).hexdigest()[:8], 'name': g['name'], 'urls': g['urls']}
    if g['freq']: s['freq'] = g['freq']
    if any('.m3u8' in u for u in g['urls'][:1]): s['hls'] = True
    out.append(s)
TOP = ['Océano FM','Del Sol FM','Azul FM','Radio Sarandí','El Espectador','Radio Carve','Radio Universal','Carve Deportiva','Radio Monte Carlo','Radiomundo','Radio Uruguay','Radio Disney','Radio Cero','FM Hit','Metrópolis FM','Alfa FM','Inolvidable FM','Babel','Clásica 650','Emisora del Sur','Radio Clarín','Galaxia FM','La Diaria Radio','Radio Oriental','Radio Rural','Aire FM','Radio Futura']
out.sort(key=lambda s: (TOP.index(s['name']) if s['name'] in TOP else 99, s['name'].lower()))
js = '/* Radios de Uruguay. Fuente: Radio Browser (radio-browser.info, dominio público) vía AlonDrilich/radio-playlists. Generado por tools_catalog.py */\n'
js += '(function (r, f) { if (typeof module === "object" && module.exports) module.exports = f(); else r.RadiaStations = f(); })(typeof self !== "undefined" ? self : this, function () { return '
js += json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '; });\n'
open('src/stations.js', 'w', encoding='utf-8').write(js)
print(len(out), 'radios;', sum(1 for s in out if s['urls'][0].startswith('https')), 'con https;', sum(1 for s in out if len(s['urls']) > 1), 'con respaldo')
print([s['name'] for s in out[:30]])
