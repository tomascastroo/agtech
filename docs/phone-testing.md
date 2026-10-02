# Probar el Escáner de Bovinos desde tu celular

La cámara del celular solo funciona en páginas **HTTPS**. Con un túnel gratuito de Cloudflare,
tu computadora publica una URL `https://…trycloudflare.com` temporal y la abrís desde el
celular. No es un deploy: la URL deja de existir cuando cerrás el túnel.

## Lo que necesitás

- **En la computadora:**
  - **Docker Desktop**, abierto y corriendo.
  - **cloudflared**:
    - macOS: `brew install cloudflared`
    - Windows: `winget install --id Cloudflare.cloudflared`
    - Linux: [descargas de Cloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
- **Celular:**
  - Android con Chrome; ideal Android 12 o más nuevo.
  - iPhone con Safari; ideal iOS 26.
  - En versiones más viejas también anda, pero la IA corre más lenta (modo WASM).
- **Conexión:** el celular necesita internet (WiFi o datos). **No** hace falta que esté en la
  misma red que la computadora.

## Paso 1 — Levantar todo (en la computadora)

En una terminal, en la carpeta del proyecto (en Windows usá **Git Bash** o **WSL**):

```bash
./scripts/phone-test.sh
```

La primera vez tarda 10–15 minutos porque construye las imágenes. Las siguientes podés usar
`./scripts/phone-test.sh --no-build`.

El script hace lo siguiente:
1. Abre el túnel HTTPS.
2. Pone esa URL en `WEB_ORIGIN` dentro de `.env`, para que los links de invitación apunten al
   túnel.
3. Levanta el stack y reinicia la API con la URL nueva.
4. Verifica la API, el servicio de IA, el worker y la web, tanto en local como a través del
   túnel, más el modelo y el motor del escáner.

Al final imprime algo así:

```
  URL para el CELULAR:   https://palabras-al-azar.trycloudflare.com
```

**Dejá esa terminal abierta** mientras probás. Con Ctrl+C se cierra el túnel. La URL cambia
cada vez que corrés el script, así que creá una solicitud nueva en cada sesión.

<details><summary>Sin el script (por ejemplo, PowerShell en Windows)</summary>

```powershell
# Terminal 1: el túnel (dejala abierta y copiá la URL https://...trycloudflare.com)
cloudflared tunnel --url http://localhost:3000

# Terminal 2: en la carpeta del proyecto
#   1) en .env cambiá la línea WEB_ORIGIN por la URL del túnel:
#      WEB_ORIGIN=https://palabras-al-azar.trycloudflare.com
docker compose up -d --build
docker compose up -d --force-recreate --no-deps api
```
</details>

## Paso 2 — Crear la solicitud (en la computadora)

1. Abrí la URL del túnel o `http://localhost:3000` e iniciá sesión como entidad:
   `maria.lopez@bancodelcampo.com.ar` / `AgroDemo2026!`.
2. Andá a **Solicitudes de garantía → Nueva solicitud**, con tipo **Bovinos** y cualquier
   productor.
3. Copiá el **link de invitación**. Tiene que empezar con la URL `https://…trycloudflare.com`.
4. Mandátelo al celular (WhatsApp, mail, etc.).

## Paso 3 — En el celular, con WiFi o datos

1. Abrí el link y tocá **aceptar**. Creá tu acceso de productor (mail y contraseña) e ingresá.
2. Completá el **Establecimiento** y el **Activo** (el rodeo, con la cantidad declarada).
3. En **Escáner de bovinos**, tocá **Escanear rodeo**.
4. Elegí el modo:
   - **Escáner fijo:** apoyá el celular quieto, apuntando a un lugar por donde pasen
     animales.
   - **Escáner móvil (barrido):** quedate quieto, empezá apuntando a un costado del rodeo y
     girá despacio.
5. Tocá **Iniciar escaneo** y aceptá los permisos (ver abajo). La primera vez descarga el
   motor de IA y el modelo, unos 30 MB.
6. Vas a ver recuadros sobre los animales y una línea punteada. El contador sube cada vez que
   un animal cruza la línea. Los recuadros amarillos son animales todavía no confirmados y los
   verdes, confirmados.
7. Tocá **FINALIZAR**. El escaneo pasa a **SINCRONIZANDO**, después a **PROCESANDO** y por
   último a **VERIFICADO EN SERVIDOR**, con el **conteo oficial**.

Si no tenés vacas cerca, apuntá la cámara a la pantalla de la computadora con el video de
prueba `infra/seed-assets/videos/paso-manga-sintetico.mp4` en pantalla completa, y usá el
escáner fijo.

### Los otros modos

- **Escáner de corral (animales quietos):**
  1. Poné en pantalla `infra/seed-assets/videos/barrido-sintetico.mp4`, que muestra 12 animales
     quietos.
  2. Elegí **Escáner de corral**.
  3. Apuntá al grupo y, si no entra entero, mové el celular despacio. Volver sobre una zona no
     duplica.
  4. El contador muestra **bovinos observados** y las **vistas** cubiertas.
- **Analizar foto:**
  1. Elegí **Analizar foto** y luego **Abrir cámara**.
  2. Tocá **Tomar foto**: se ven las cajas y el conteo de cada foto.
  3. Tocá **Otra foto** para sumar zonas del grupo. Cada foto tiene que compartir una parte con
     la anterior.
  4. Tocá **FINALIZAR**.
- **Manga + RFID (individual):**
  1. Poné en pantalla `infra/seed-assets/videos/manga-individual-sintetico.mp4`, donde pasa un
     bovino por vez.
  2. Elegí **Manga + RFID** y tocá **Iniciar sesión de manga**.
  3. Cuando diga **Bovino estable: leé la caravana**, tocá **Leer RFID (SIMULADO)**.
  4. Aparece **✓ Bovino identificado** (preliminar) con la caravana y la cantidad de imágenes.
     Con dos bovinos en cuadro, o si se mueve, dice que **no se asoció**.
  5. Tocá **Registrar siguiente bovino** y repetí. Al final, **FINALIZAR**.
  6. El servidor confirma cada animal. El banco ve **Bovinos identificados: N** marcado
     SIMULADO.
  - Hoy no hay lector físico conectado: las lecturas son simuladas.
- **Recomendado:** si el rodeo es de feedlot, el escáner marca **Recomendado** en el escáner de
  corral; en cría, en el fijo; en pastoreo, en el barrido.
- **Mensajes en rojo** ("Mové más lento", "Acercate", "Hay demasiados animales ocultos", "Falta
  cubrir otra zona"): son instrucciones en vivo. El resultado del servidor las repite para el
  próximo escaneo.

## Permisos que hay que aceptar

| Permiso | Para qué | Si lo rechazás |
|---|---|---|
| **Cámara** | Escanear (obligatorio) | No se puede escanear. Habilitalo en los ajustes del sitio y recargá |
| **Ubicación** | Registrar dónde se hizo el escaneo y si el operador se movió | El escaneo funciona, pero queda "sin ubicación" (advertencia) |
| **Movimiento y orientación** (solo iPhone) | Arco barrido y aviso "Girá más despacio" | El escaneo funciona, sin esos datos |

Dónde se habilitan si los rechazaste:
- **Android/Chrome:** el candado al lado de la URL → *Permisos*.
- **iPhone:** *Ajustes → Safari → Cámara / Ubicación*, o "aA" en la barra → *Ajustes del sitio
  web*.

## Paso 4 — Probar SIN señal (modo avión)

1. **Una vez con señal**, abrí el escáner (Paso 3, puntos 3 a 5). Con eso el teléfono guarda
   el escáner, el motor y el modelo para usarlos sin conexión.
2. Activá el **modo avión**.
3. Dos formas de seguir:
   - si ya estabas en la pantalla del escáner, iniciá un escaneo normalmente;
   - si no, abrí de nuevo `https://…trycloudflare.com/escaner/<id-de-la-solicitud>` (la misma
     dirección que tenía el escáner). Se abre igual, con el chip **OFFLINE**.
4. Escaneá y tocá **FINALIZAR**. Va a decir **OFFLINE · Guardado en el teléfono; se sube al
   volver la señal**.

También podés cortar la señal **en medio** de un escaneo: sigue contando sin problemas.

## Paso 5 — Reconexión y sincronización

1. Desactivá el modo avión.
2. En pocos segundos, sin tocar nada, el estado pasa por:
   - **PENDIENTE**;
   - **SINCRONIZANDO** ("Subiendo cuadros x/y");
   - **PROCESANDO**;
   - **VERIFICADO EN SERVIDOR** ("Conteo oficial: N").
3. Si se vuelve a cortar a mitad de la subida, al volver la señal sigue desde donde quedó, sin
   duplicar cuadros.
4. El escaneo también aparece en la solicitud (sección **Escáner de bovinos**) con su estado.

## Paso 6 — Ver el resultado como entidad (computadora)

Abrí la solicitud en **Solicitudes de garantía**. En **Escaneos de bovinos** vas a ver:
- el **conteo oficial** del servidor y el del celular (preliminar);
- el modo: el fijo es comparable con lo declarado y el barrido es una cota inferior;
- la calidad, las advertencias, la ubicación y los cuadros representativos con las
  detecciones.

## Si algo no anda

| Síntoma | Qué hacer |
|---|---|
| "No se pudo iniciar el escáner: Sin permiso de cámara" | Habilitá la cámara en los permisos del sitio y recargá |
| La cámara no abre y no aparece ningún pedido de permiso | Verificá que la URL empiece con **https://** (no uses la IP de la PC con http) |
| El link de invitación dice `localhost` | La solicitud se creó antes del túnel: creá una nueva con el script corriendo |
| Queda en SINCRONIZANDO mucho tiempo | Es normal con señal débil (sube 20–25 MB por minuto de escaneo). Revisá que la terminal del túnel siga abierta |
| ERROR en el servidor | `docker compose logs worker ai-service`. Si la base se reseteó con `pnpm db:reset`, reiniciá con `docker compose restart api worker` |
| "Sin señal: abrí el escáner una vez con conexión" | Abrí el escáner con señal al menos una vez antes de usar el modo avión |

| Safari dice "Ocurrió un problema varias veces" | iOS cerró la página por memoria. En iPhone el escáner ahora usa WASM (no WebGPU) y limita la memoria; si vuelve a pasar, mandá los logs (abajo). El escaneo cortado no se pierde: a los ~60 s se sube solo con los cuadros guardados y queda marcado "Escaneo interrumpido" |
| Me sacó de la cuenta | Volvé a ingresar: los escaneos guardados en el teléfono se suben solos después. La sincronización ya no te manda al login a mitad de un escaneo |

### Ver los logs

**Servidor** (en la computadora, en la carpeta del proyecto):

```bash
docker compose logs --since 30m web api worker ai-service > logs-escaner.txt
```

**Celular (iPhone)**, la consola del navegador:
1. En el iPhone, andá a *Ajustes → Apps → Safari → Avanzado* y activá **Inspector web**.
2. Conectá el iPhone por cable a una Mac y abrí Safari en la Mac. Si no ves el menú
   *Desarrollo*, activalo en *Ajustes → Avanzado → Mostrar funciones para desarrolladores web*.
3. En Safari de la Mac, abrí *Desarrollo → [tu iPhone] → la página del escáner*, y luego la
   pestaña **Consola**.
4. Si iOS cerró la página, el motivo queda en el iPhone, en *Ajustes → Privacidad y seguridad →
   Análisis y mejoras → Datos de análisis*: buscá entradas `JetsamEvent` (memoria) o
   `com.apple.WebKit.WebContent`.

**Android:** activá la depuración USB, conectalo a la PC y abrí `chrome://inspect` en Chrome
de la PC.

Limitaciones de esta prueba:
- Las **fotos subidas** (no las del escáner) y las descargas de documentos usan URLs del
  almacenamiento en `localhost:9000`. En el celular no cargan, pero en la computadora sí. No
  afecta al escáner.
- La URL del túnel es temporal y pública mientras esté abierta: no la compartas. Para cerrarla,
  usá Ctrl+C en la terminal del script.
