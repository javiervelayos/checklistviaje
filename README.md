# 🧳 MiMaleta: checklist de viaje (versión con recuperación por email)

> Rama `mimaleta` → https://mimaleta.netlify.app · La versión original sigue en la rama `main` (Maleta).

App web para preparar el equipaje de cada escapada. Puedes crear escapadas, organizarlas en grupos (Ropa, Aseo, Documentos…) y añadir, editar, marcar, reordenar y eliminar ítems. Los cambios se guardan en Netlify y aparecen en todos tus dispositivos.

## Qué hay en el proyecto

```
public/                  ← la web (HTML, CSS, JS, iconos)
netlify/functions/data.mjs  ← pequeña API que guarda los datos en Netlify Blobs
netlify.toml             ← configuración de Netlify
package.json             ← dependencia @netlify/blobs
```

No necesita base de datos externa ni cuentas en otros servicios: los datos se guardan en **Netlify Blobs**, que va incluido en Netlify.

## Cómo subirlo a Netlify

> ⚠️ El método de arrastrar una carpeta a *Netlify Drop* **no sirve**, porque no despliega la función que guarda los datos. Usa una de estas dos opciones.

### Opción A: desde GitHub (recomendada)

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta.
2. En [app.netlify.com](https://app.netlify.com): **Add new site → Import an existing project → GitHub** y elige el repositorio.
3. Netlify lee `netlify.toml` solo. Deja el *build command* vacío y pulsa **Deploy**.
4. Cada vez que hagas un cambio en GitHub, Netlify lo vuelve a publicar.

### Opción B: con la terminal (Netlify CLI)

```bash
npm install            # instala @netlify/blobs
npm install -g netlify-cli
netlify login
netlify init           # o: netlify link, si el sitio ya existe
netlify deploy --prod
```

## Cuentas de usuario

Cada persona crea su cuenta con **nombre y contraseña** y solo ve sus escapadas. La sesión queda recordada en cada dispositivo (1 año) y se cierra desde el botón con la inicial, arriba a la derecha.

- Las contraseñas se guardan cifradas (scrypt); las sesiones van firmadas.
- Las escapadas creadas antes de existir las cuentas pasaron a la **primera cuenta** que se creó.
- Para que nadie más pueda crear cuentas: en Netlify, *Environment variables* → `ALLOW_SIGNUP` = `false` y volver a desplegar. Las cuentas existentes siguen funcionando.
- **Cambiar contraseña:** menú de la inicial → «Cambiar contraseña». Cierra la sesión en los demás dispositivos.
- **Contraseña olvidada por email:** en la pantalla de entrada, «¿Olvidaste la contraseña?» → nombre o email → si la cuenta tiene email, llega un enlace (Brevo) válido 1 hora y de un solo uso. Máximo un email cada 2 minutos por cuenta. Cada usuario añade su email en su menú («Mi email») o al crear la cuenta.
- Variables en Netlify: `BREVO_API_KEY` (secreta), `MAIL_FROM` (`mimaleta@jvelayos.es`), `MAIL_FROM_NAME` (`MiMaleta`), `APP_URL` (`https://mimaleta.netlify.app`). El dominio jvelayos.es está autenticado en Brevo (registros DNS en Hostinger).
- **Contraseña olvidada sin email:** la cuenta administradora (la que se quedó las escapadas antiguas o, si no, la más antigua) tiene «Usuarios y contraseñas» en su menú. Ahí puede dar una contraseña temporal a cualquiera; al entrar con ella hay que elegir una nueva y se cierran sus sesiones abiertas. Las escapadas no se tocan.

## Cómo funciona la sincronización

- Cada cambio se guarda al momento en el dispositivo y se sube a Netlify medio segundo después.
- Al abrir la app, al volver a ella o cada 20 segundos mientras está abierta, descarga los cambios de los demás dispositivos.
- Si no hay conexión, sigues trabajando con normalidad y los cambios se suben cuando vuelve la conexión. El indicador de arriba a la derecha muestra el estado.
- Si editas **la misma escapada** en dos dispositivos a la vez, prevalece el último cambio. Las distintas escapadas se fusionan sin problema.

## Instalarla en el móvil

Abre la URL en el móvil y elige **Añadir a pantalla de inicio** (Safari: botón Compartir; Chrome: menú ⋮). Se abrirá como una app, a pantalla completa.

## Trucos de uso

- **Reordenar:** arrastra desde el asa ⠿, también entre grupos distintos. Los grupos se reordenan desde el asa de su cabecera.
- **Editar:** toca el texto de un ítem, el nombre de un grupo o el título de la escapada.
- **Añadir varios ítems de golpe:** pega una lista con un ítem por línea en «Añadir ítem…».
- **Deshacer:** al borrar un ítem, un grupo o una escapada aparece un botón «Deshacer».
- **Reutilizar:** al crear una escapada puedes copiar los grupos e ítems de otra (todo sin marcar) o usar «Duplicar escapada».
