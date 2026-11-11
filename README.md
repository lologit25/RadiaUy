# RADIA

Radio uruguaya sin tandas: elegís hasta tres emisoras, una es la favorita, y RADIA cambia sola cuando viene la publicidad y vuelve cuando termina.

## Cómo funciona

- **Anticipación.** Escuchás con unos segundos de retraso (12 por defecto). RADIA analiza el vivo, así que ve la tanda antes de que te llegue y cambia en el borde.
- **Detección.** Tres señales: análisis de audio (salto de volumen, brillo y silencios cortos entre avisos), horarios de tanda aprendidos por emisora y el botón "Esto es publicidad".
- **Match por franja.** Cada emisora tiene un tipo de contenido por franja horaria. A menor match, transición más corta; por debajo de 40 % no se mezclan las señales.
- **Favorita.** Siempre se vuelve a ella cuando termina su tanda, salvo que elijas otra a mano.

## Radios incluidas

114 radios de Uruguay con sus streams reales (Océano, Del Sol, Azul, Sarandí, El Espectador, Carve, Universal, Monte Carlo, Disney, Hit, Metrópolis y más), tomadas del directorio abierto Radio Browser. Si alguna cambia su stream, RADIA prueba el de respaldo y, cuando hay red, suma las que el directorio tenga de más. Para regenerar la lista: `python3 tools_catalog.py`.

En Emisoras, el triángulo de cada radio la prueba y te dice si suena y si deja anticipar sus tandas.

## Publicarla gratis (GitHub Pages)

1. Creá una cuenta en github.com y un repositorio público llamado `radia`.
2. Add file, Upload files, subí `index.html` y confirmá.
3. Settings, Pages, Branch: `main`, carpeta `/ (root)`, Save.
4. En un minuto queda en `https://TU-USUARIO.github.io/radia`. En el iPhone: Compartir, Agregar a pantalla de inicio.

Una página publicada por https solo puede reproducir streams https: 87 de las 114 radios. Las otras 27 aparecen con "Necesita el puente de audio" hasta que configures el puente.

## Usarla

- `index.html` es la app completa en un solo archivo. Abrila en un navegador o subila a cualquier hosting estático gratuito (GitHub Pages, Cloudflare Pages, Netlify).
- **Demo**: audio sintético con tandas programadas. Sirve para ver el motor en cualquier lado.
- **Radios en vivo**: carga las emisoras de Uruguay desde radio-browser.info y reproduce los streams reales.

## Puente gratis en Cloudflare (carpeta `puente/`)

Sin análisis de audio no hay cambio automático, y muchas radios no dejan que el navegador las analice. El puente reenvía el stream con ese permiso. En el plan gratuito de Cloudflare Workers no se duerme y alcanza para uso personal (100.000 conexiones por día).

1. Creá una cuenta en dash.cloudflare.com.
2. Workers & Pages, Create, Start with Hello World, Deploy.
3. Edit code, borrá todo, pegá el contenido de `puente/worker.js`, Deploy.
4. Copiá la dirección (`https://algo.workers.dev`) y pegala en RADIA, Ajustes, Puente de audio.

El puente solo acepta los servidores de las radios del catálogo. No está probado todavía contra las radios reales.

## Cómo detecta la tanda (v2)

Las radios procesan el audio para que todo suene parejo, así que el volumen no delata la publicidad. RADIA mide cada segundo la forma del sonido (8 bandas) y busca cortes de timbre. Una tanda es una sucesión de segmentos cortos (6 a 45 s) de sonido distinto que no vuelve al sonido anterior. Necesita oír unos 30 s para confirmarla; por eso el margen es de 45 s.

Para calibrarlo con radios reales: Ajustes, Copiar diagnóstico, después de escuchar una tanda.

## Puente alternativo en Node (carpeta `proxy/`)

Muchas radios no permiten que el navegador analice su audio, y otras emiten en http (un sitio https no puede reproducirlas). El puente resuelve las dos cosas.

    cd proxy && node server.js      # Node 18+, sin dependencias

Después pegá su dirección en Ajustes > Puente de audio. Variables: `PORT`, `ALLOW_ORIGIN` (la dirección de tu RADIA), `ALLOW_HOSTS`, `MAX_STREAMS`.

Hosting gratuito: sirve un plan gratis tipo Render para uso personal, con dos salvedades. El servicio se duerme tras 15 minutos sin uso y tarda cerca de un minuto en despertar, y el ancho de banda gratis es limitado (tres streams consumen unos 130 MB por hora): revisá el tope vigente antes de usarlo a diario.

## Desarrollo

    node --test tests/*.test.js     # motor y puente
    node build.js                   # genera dist/index.html

- `src/engine.js`: match, detector, horarios, director. Lógica pura, probada con Node.
- `src/app.js`: audio (Web Audio), sintetizador de la demo e interfaz.

## Límites conocidos

- El detector de audio está validado con la demo sintética, no con radios reales. Sus umbrales van a necesitar ajuste con audio real.
- Sin puente, las radios que no permiten análisis suenan sin anticipación: dependen de horarios aprendidos y avisos manuales.
- En iPhone, Safari limita el audio en segundo plano y el control de volumen de varios streams a la vez. No está probado ahí con radios reales.
- Los perfiles por franja del catálogo de demostración son aproximados y se editan desde Emisoras.
