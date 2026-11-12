"""Audio de prueba realista para el reconocedor de avisos: voces sintetizadas en español con música de fondo
(avisos), charla siempre distinta (programa) y una canción. Cada emisión se codifica a MP3 por separado, con
otro desfase y otro volumen, como pasa al volver a emitir un aviso en una radio real."""
import subprocess, random, wave, numpy as np, os, json
SR = 22050; out = '/tmp/fx'; os.makedirs(out, exist_ok=True); rnd = random.Random(11)
W = "casa tiempo mercado precio familia semana ciudad camino oferta noticia gobierno partido equipo lluvia verano trabajo escuela cliente vecino barrio música historia campo puerto viaje salud banco tarjeta cuota regalo fiesta mañana tarde noche domingo ruta playa centro plaza feria carne vino pan leche auto moto casa nueva grande mejor siempre nunca ahora mismo también porque cuando donde mientras entonces además todavía".split()
def talk(n): return '. '.join(' '.join(rnd.choice(W) for _ in range(rnd.randint(6, 11))).capitalize() for _ in range(n)) + '.'
def say(text, voice, speed, pitch, name):
    subprocess.run(['espeak-ng', '-v', voice, '-s', str(speed), '-p', str(pitch), '-w', f'{out}/_{name}.wav', text], check=True)
    w = wave.open(f'{out}/_{name}.wav'); x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(np.float32) / 32768; r = w.getframerate(); w.close()
    if r != SR: x = np.interp(np.arange(0, len(x), r / SR), np.arange(len(x)), x).astype(np.float32)
    return x
def bed(n, root, seed):
    t = np.arange(n) / SR; r = random.Random(seed); y = np.zeros(n, np.float32)
    for k, semis in enumerate([0, 4, 7, 12][:3 + seed % 2]): y += np.sin(2 * np.pi * root * 2 ** (semis / 12) * t + r.random() * 6) * (.5 + .5 * np.sin(2 * np.pi * (1.5 + seed % 3) * t + k))
    return y / np.abs(y).max()
def norm(x, rms=.12): return (x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * rms).astype(np.float32)
def ad(i):
    v = ['es', 'es-419', 'es+f2', 'es+m3', 'es+f4', 'es-419+m5'][i % 6]
    x = say(talk(4 + i % 3), v, 175 + 8 * i, 35 + 9 * i, f'ad{i}')
    return norm(x + .35 * np.abs(x).max() * bed(len(x), 196 * 2 ** (i / 6), i))
def prog(secs, voice='es+m1'):
    x = np.zeros(0, np.float32)
    while len(x) < secs * SR: x = np.concatenate([x, say(talk(3), voice, 150, 30, 'p')])
    return norm(x[:int(secs * SR)])
def song(secs, seed):
    r = random.Random(seed); n = int(secs * SR); t = np.arange(n) / SR; y = np.zeros(n, np.float32); beat = .25; scale = [0, 2, 4, 5, 7, 9, 11, 12]
    for b in range(int(secs / beat)):
        f = 220 * 2 ** (scale[r.randrange(8)] / 12); i0 = int(b * beat * SR); i1 = min(n, i0 + int(beat * SR)); tt = t[i0:i1] - t[i0]
        y[i0:i1] += (np.sin(2 * np.pi * f * tt) + .5 * np.sin(4 * np.pi * f * tt)) * np.exp(-3 * tt)
    return norm(y + .4 * bed(n, 110, seed))
ads = {i: ad(i) for i in range(1, 7)}; s1 = song(130, 5)
def build(name, parts, offset, gain):
    xs, marks, t = [], [], 0.0
    for kind, x in parts: marks.append([kind, round(t, 2), round(t + len(x) / SR, 2)]); t += len(x) / SR; xs.append(x)
    x = np.concatenate(xs) * gain; w = wave.open(f'{out}/{name}.wav', 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x, -1, 1) * 32000).astype('<i2').tobytes()); w.close()
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', f'{out}/{name}.wav', '-codec:a', 'libmp3lame', '-b:a', '64k', f'{out}/{name}.mp3'], check=True)
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(offset), '-i', f'{out}/{name}.mp3', '-ac', '1', '-ar', '44100', '-f', 'f32le', f'{out}/{name}.f32'], check=True)
    return [[k, round(a - offset, 2), round(b - offset, 2)] for k, a, b in marks]
A = lambda i: (f'ad{i}', ads[i]); P = lambda s: ('prog', prog(s))
M = {
  'e1': build('e1', [P(45), A(1), A(2), A(3), P(35)], 0.000, 1.00),            # primera vez que suenan los avisos 1, 2 y 3
  'e2': build('e2', [P(40), A(2), A(4), A(1), P(35)], 0.137, 0.80),            # 2 y 1 se repiten; 4 es nuevo
  'e3': build('e3', [P(30), A(1), A(5), A(2), A(4), P(30)], 0.071, 1.15),      # 1, 2 y 4 conocidos; 5 nuevo
  'm1': build('m1', [P(20), ('song', s1), P(15)], 0.000, 1.00),                # una canción...
  'm2': build('m2', [P(25), ('song', s1), P(15)], 0.093, 0.90),                # ...que vuelve a sonar
}
json.dump(M, open(f'{out}/marks.json', 'w')); print(json.dumps(M))
# Radio completa para la prueba en navegador: los avisos 1 y 2 suenan en cuatro tandas. La otra radio nunca tiene avisos.
M['r1'] = build('r1', [P(30), A(1), A(2), P(30), A(2), A(1), P(25), A(1), P(25), A(2), P(20)], 0.0, 1.0)
M['r2'] = build('r2', [('prog', prog(260, 'es+f3'))], 0.0, 1.0)
json.dump(M, open(f'{out}/marks.json', 'w')); print('r1', json.dumps(M['r1']))
