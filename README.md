# ☁ Home Cloud ☁

Repositorio del proyecto de Final de Ciclo del Grado Superior en Desarrollo de Aplicaciones Web (DAW) realizado en el I.E.S. Fernando Wirtz.

**Home Cloud** es una aplicación web desarrollada con Flask que permite gestionar y compartir archivos almacenados en un servidor propio de forma sencilla y segura.

# Descripción

**Home Cloud** nace con la idea de crear una alternativa sencilla a los servicios tradicionales de almacenamiento en la nube, permitiendo al usuario gestionar sus propios archivos desde una interfaz web.

La aplicación está pensada para ejecutarse en un servidor propio, como puede ser un ordenador o una Raspberry Pi, proporcionando acceso a los archivos desde cualquier dispositivo que pueda conectarse a la aplicación.

### Principales objetivos:

- Gestionar archivos desde una interfaz web.
- Subir archivos al servidor.
- Descargar archivos.
- Eliminar archivos.
- Compartir archivos mediante enlaces.
- Controlar el acceso a los archivos.
- Disponer de una interfaz sencilla y adaptada a diferentes dispositivos.
- Facilitar el despliegue mediante Docker.
- Funcionalidades
- Gestión de archivos

El usuario puede visualizar los archivos almacenados en **Home Cloud** y realizar diferentes operaciones sobre ellos.

``Subir archivos.``
``Descargar archivos.``
``Eliminar archivos.``
``Visualizar información de los archivos.``
``Organizar y gestionar el almacenamiento.``

Una de las funcionalidades principales del proyecto es la posibilidad de compartir archivos con otras personas mediante enlaces.

Estos enlaces pueden utilizarse para permitir que una persona externa descargue un archivo sin necesidad de tener acceso completo a la aplicación.

# Autenticación

La aplicación dispone de un sistema de autenticación para proteger el acceso a la plataforma y evitar que usuarios no autorizados puedan acceder a los archivos almacenados.

# Interfaz web

**Home Cloud** cuenta con una interfaz web desde la que se pueden realizar las principales operaciones de gestión.

La aplicación está diseñada siguiendo un enfoque responsive para poder utilizarse desde ordenadores, tablets y dispositivos móviles.

# Arquitectura

El proyecto está desarrollado siguiendo una arquitectura basada en Flask Blueprints, separando las diferentes funcionalidades de la aplicación en módulos independientes.

De esta forma, cada parte de la aplicación puede mantenerse y desarrollarse de manera independiente.

# Instalación local
Sigue estos pasos para ejecutar la aplicación Flask de forma local:

- Clonar el repositorio

    ``git clone https://github.com/Hugo-Fdez-Calvete/proyectoweb.git``

    ``cd proyectoweb``

- Crear y activar el entorno virtual

    ``python -m venv venv``


- Instalar dependencias

    ``.\venv\Scripts\pip.exe install -r requirements.txt``

- Levantar la db

    ``.\venv\Scripts\flask.exe --app app.main crear-tablas``

- Ejecutar la aplicación Flask

    Desde la carpeta raíz del proyecto:

    ``.\venv\Scripts\python.exe -m app.main``

- Verificar en el navegador

    Abre tu navegador y accede a:

    ``http://127.0.0.1:5000/``

# Ejecución con Docker

Home Cloud también puede ejecutarse mediante Docker, permitiendo aislar la aplicación y simplificar su despliegue.

# Seguridad

La aplicación tiene en cuenta diferentes aspectos relacionados con la seguridad:

Autenticación de usuarios.
Protección de las sesiones.
Uso de variables de entorno para información sensible.
Validación de archivos subidos.
Separación de los archivos almacenados respecto al código de la aplicación.
Exclusión mediante .gitignore de archivos que no deben almacenarse en el repositorio.

Los archivos y configuraciones sensibles no deben subirse al repositorio público.

## Medidas de seguridad

- **Servidor de producción**: el contenedor arranca con **Gunicorn** (1 proceso × 48 hilos, por el chat en directo; ver más abajo) y no con el servidor de desarrollo de Flask. Para depurar en local sigue valiendo `python -m app.main`.
- **Cookie de sesión** solo por HTTPS (`Secure`), invisible para JavaScript (`HttpOnly`) y `SameSite=Lax`. Para probar en local por http desde otro equipo de la red: `COOKIE_SECURE=0`.
- **CSRF** en todos los formularios y peticiones que cambian algo (subir, borrar, renombrar, admin, perfil, Pulso). Los formularios llevan un campo oculto `csrf_token` y `static/js/csrf.js` añade la cabecera `X-CSRFToken` a `fetch` y `XMLHttpRequest`.
- **Sesión nueva al iniciar sesión** (evita la fijación de sesión).
- **Cabeceras**: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.
- **Nginx**: en `deploy/nginx-seguridad.conf` están HSTS, el bloqueo de archivos ocultos y rutas de bots, el bloque `/ws/` para el chat y la IP real si usas Cloudflare.

# Grupos, chat, carpetas compartidas y avisos

- **Carpetas compartidas** (`/HomeCloud/compartir?path=…`, `/HomeCloud/compartido`): cualquier carpeta de tu nube se comparte con otro usuario registrado, con permiso de **ver** o de **editar**. Lo que suben los demás ocupa espacio del propietario. Al renombrar la carpeta la compartición la sigue; al borrarla, desaparece.
- **Grupos** (`/HomeCloud/grupos/`): chats, carpetas y archivos compartidos entre varios usuarios.
  - El espacio del grupo **se descuenta** del de su creador (si tiene 500 GB y crea un grupo de 200 GB, para su nube personal le quedan 300 GB). Solo se puede reservar lo que el creador tiene libre en ese momento.
  - Permisos por miembro: subir, crear carpetas, borrar, escribir en los chats, crear chats y añadir miembros. Ver archivos y leer chats lo puede hacer cualquier miembro.
  - El creador y los **administradores** de la web pueden hacerlo todo. Los administradores ven todos los grupos y comparticiones en `/HomeCloud/admin/grupos` y `/HomeCloud/admin/compartidos`.
  - Los archivos de cada grupo están en `app/cloud_groups/<id>` (volumen `flask_groups`).
- **Chat en directo**: WebSocket propio (RFC 6455, `app/services/websocket.py`) en `/ws/chat`, sin librerías nuevas. Cada pestaña con un chat abierto ocupa un hilo de Gunicorn, y todas las conexiones tienen que estar en el mismo proceso para que los mensajes lleguen a todos: por eso Gunicorn arranca con **1 proceso y 48 hilos**. Si el WebSocket no puede conectar (por ejemplo, Nginx sin el bloque `/ws/`), el chat sigue funcionando consultando cada 4 segundos.
- **Invitaciones**: al añadir a alguien a un grupo se le envía una invitación; entra cuando la acepta (en *Grupos* o en su perfil). Quien la envió, el creador o un administrador pueden retirarla.
- **Carpetas públicas** (`/publico`): una carpeta de tu nube se puede hacer pública con un enlace secreto (`/publico/<enlace>`), de solo lectura y sin necesidad de cuenta. Opcionalmente aparece en el listado público. El enlace se puede cambiar (el anterior deja de funcionar) o retirar. Las descargas llevan el nombre en `?name=` para que Nginx no las confunda con ruido de bots.
- **Avisos por correo**: en *Configuración → Correo y avisos* cada usuario vincula, cambia o desvincula su correo, lo confirma (enlace firmado que caduca en 2 días) y elige qué avisos quiere. Como mucho un correo por chat cada 20 minutos. Se envían por SMTP en segundo plano.
- **Eliminar cuenta**: en *Configuración → Eliminar cuenta* (con contraseña y escribiendo ELIMINAR). Se borran sus archivos, grupos creados, comparticiones, carpetas públicas, avisos, vínculo con Google y tinta de Pixel Art; sus mensajes en grupos de otros quedan como «Usuario eliminado». El último administrador no puede borrarse. Los administradores eliminan usuarios con el mismo proceso.

## Configurar el correo (Gmail)

1. En la cuenta de Google que enviará los correos, activa la verificación en dos pasos.
2. Crea una **contraseña de aplicación** (Cuenta de Google → Seguridad → Contraseñas de aplicaciones).
3. En Portainer, en las variables del stack, añade `MAIL_USERNAME` (el correo) y `MAIL_PASSWORD` (la contraseña de aplicación). Opcional: `MAIL_FROM_NAME`.

Sin esas variables la web funciona igual, pero no envía correos (el perfil lo indica).

# Tests, CI y estado de la app

- **Tests** (`tests/`, con pytest): cada test usa una base de datos vacía y carpetas temporales, así que nunca tocan tus datos. Cubren la nube personal, grupos (espacio, invitaciones, permisos, chat), carpetas compartidas y públicas, correo, eliminar cuenta, el WebSocket y `/salud`.

  ```bash
  pip install -r requirements-dev.txt
  pytest
  ```

- **CI** (`.github/workflows/ci.yml`): en cada push, GitHub Actions pasa los tests, construye la imagen de Docker, la arranca y comprueba `/salud`. Si algo falla, el commit sale en rojo. Despliega en Portainer cuando esté en verde.
- **Estado** (`GET /salud`): JSON con el estado de la base de datos, las carpetas de archivos, el disco libre, el correo y las conexiones del chat. Responde 200 si todo va bien y 503 si falla algo importante. El `HEALTHCHECK` del Dockerfile lo consulta cada 30 s y Portainer marca el contenedor como *healthy* o *unhealthy*.
- **Logs**: cada petición lleva un identificador (`X-Request-ID`) que aparece en la respuesta, en el log de accesos de Gunicorn (con la IP real y la duración en ms) y en los mensajes de la app. Las peticiones de más de 2 s se avisan como `WARNING`. Nivel con `LOG_LEVEL` (INFO por defecto).
- **Sesiones**: se guardan en `app/data/sessions` (volumen `flask_data`), así que no se pierden al redesplegar.

# Dependencias

Las dependencias necesarias para ejecutar el proyecto se encuentran en:

requirements.txt

Para instalarlas:

pip install -r requirements.txt

## Futuras mejoras

Algunas funcionalidades que podrían incorporarse en futuras versiones son:

- Mensajes directos entre dos usuarios (fuera de los grupos).
- Enlaces públicos de descarga con caducidad.
- Búsqueda de archivos.
- Previsualización de imágenes y documentos.
- Enlaces de descarga con fecha de expiración.
- Integración con servicios de almacenamiento externos.
- Aplicación móvil.
- Integración con un bot de WhatsApp para consultar y compartir archivos.
- Panel de administración y estadísticas.
- Mejoras adicionales de seguridad.

Este proyecto ha sido desarrollado como parte del Proyecto de Fin de Ciclo del Grado Superior en Desarrollo de Aplicaciones Web (DAW).

El objetivo del proyecto es aplicar los conocimientos adquiridos durante el ciclo en diferentes áreas del desarrollo web, incluyendo:

- Desarrollo backend.
- Desarrollo frontend.
- Gestión de sesiones y autenticación.
- Gestión de archivos.
- Bases de datos.
- Control de versiones.
- Contenedores y despliegue.
- Seguridad web.

# Autor

![Banner](./README_img/banner.png)
# Pulso · música visual (`/pulso`)

Sección con un fondo animado (WebGL) que reacciona a la música, al estilo de los visuales de Arkestra. El anillo del visualizador está fijo en el centro y se puede quitar (botón del reproductor o tecla `V`); el fondo sigue animándose solo.

**YouTube: Canción / Vídeo** (como YouTube Music). En modo *Canción* se reproduce la pista oficial de audio (canal «Artista - Topic», portada fija) y el reproductor se queda en 200×200 px; en modo *Vídeo*, el videoclip. Las normas de YouTube no permiten separar el audio del vídeo ni ocultar el reproductor, así que no existe un modo 100 % solo audio. Buscar la otra versión de una canción cuesta 100 unidades de cuota y se guarda en memoria para todos.

- **Solo con sesión iniciada**: `/pulso` y toda su API exigen haber iniciado sesión en la web; si no, redirige a `/login`.
- **Mi música (en la nube de cada usuario)**: las canciones se suben a la carpeta `Musica` de su Home Cloud y ocupan espacio de su cuota (`storage_gb`); si no queda espacio, la subida se rechaza. En la lista aparecen todos los archivos de audio de su nube, también los subidos desde «Mis archivos», y se pueden borrar desde Pulso.
- **Sonido**: «Empezar» reproduce la primera canción de su nube; si no tiene ninguna, abre la biblioteca. La demo nunca suena sola.
- **Demo**: tres pistas generadas en el navegador. Solo se reproducen pulsándolas en la pestaña *Demo*, y esa pestaña desaparece al conectar Google.
- **Visualizador solo con audio real**: el anillo y las chispas solo aparecen cuando la página está escuchando el audio de verdad (su música, la demo, o YouTube con «Audio real» activado). No hay ritmo inventado: con YouTube sin «Audio real», el fondo queda en reposo.
- **YouTube y YouTube Music**: botón **Iniciar sesión con Google** en la portada de Pulso, en el reproductor y en la biblioteca. Al conectarse, cada usuario tiene dos apartados:
  - **Buscar** canciones (y pegar cualquier enlace de YouTube / YouTube Music).
  - **Listas**: sus listas de reproducción, incluidas las creadas en YouTube Music.

- **Continuar donde lo dejaste**: Pulso guarda en el navegador (por usuario) la cola, la canción y el segundo en que ibas. Al volver, la portada de Pulso muestra «Continuar donde lo dejaste».
- **La música sigue por toda la web**: si sales de Pulso con algo sonando (menú, barra de navegación, pie…), la otra página se abre encima en un marco a pantalla completa y Pulso sigue sonando debajo. La dirección y el botón atrás funcionan como siempre. Aparece un mini reproductor abajo a la derecha (anterior, pausa, siguiente, volver a Pulso y cerrar). Con YouTube, su reproductor se queda a la vista encima del mini reproductor, como exigen sus normas. «Cerrar» para la música y deja la página que estabas viendo. Si la música está en pausa, se navega normal. Para que funcione, las páginas se sirven con `X-Frame-Options: SAMEORIGIN` (si Nginx pone `DENY`, cámbialo a `SAMEORIGIN`).
- **Cookies de YouTube**: el reproductor de YouTube (desde `youtube-nocookie.com`) no se carga hasta que el usuario acepta sus cookies en un aviso con «Aceptar» y «Rechazar». El permiso se puede retirar en la pestaña YouTube o en `/cookies` (política de cookies, enlazada en el pie de todas las páginas).

### Vínculo automático con el YouTube de cada usuario

El inicio de sesión lo hace el servidor (OAuth 2.0 con `access_type=offline`): Google entrega un *refresh token* que se guarda en la tabla `google_links` de `users.db`, y el navegador recibe una cookie aleatoria (`pulso_google`, 180 días, `HttpOnly`). En la base de datos solo se guarda el hash de esa cookie.

- En cada visita la página encuentra el vínculo y renueva el token sola: el usuario sigue conectado sin volver a iniciar sesión.
- La cuenta de Google queda unida al usuario de la web y le sigue en cualquier dispositivo; en un navegador compartido, cada usuario ve solo su propio YouTube.
- «Cerrar sesión» revoca el permiso en Google y borra el vínculo.
- La tabla `google_links` se crea sola al arrancar la app (no hace falta volver a ejecutar `crear-tablas`).

Lo que **no** da la API oficial de YouTube: los álbumes guardados en la biblioteca de YouTube Music ni la página de inicio/recomendaciones de YouTube.

### Por qué YouTube necesita «Audio real»

El navegador no deja leer el sonido de un iframe de otro dominio (youtube.com). El botón *Audio real* usa la captura de pestaña: se elige **esta pestaña** y se marca **«Compartir también el audio de la pestaña»**. Funciona en Chrome y Edge de escritorio; en el resto, con YouTube no hay visualizador.

Si las subidas grandes fallan con error 413, sube el límite en Nginx (`client_max_body_size 200M;` en el `server` de la web).

### Configurar Google

1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto.
2. *APIs y servicios › Biblioteca* → activa **YouTube Data API v3**.
3. *Pantalla de consentimiento de OAuth* (o *Google Auth Platform*) → tipo **Externo**. En *Permisos* añade `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` y `.../auth/youtube.readonly`. Mientras la app esté en **Prueba**, solo pueden entrar las cuentas que añadas como *usuarios de prueba* (hasta 100). Para que entre cualquiera hay que pasar la verificación de Google (`youtube.readonly` es un permiso sensible).
4. *Credenciales › Crear credenciales › ID de cliente de OAuth* → **Aplicación web**:
   - *Orígenes de JavaScript autorizados*: `https://hugofernandezcalvete.es`
   - *URI de redireccionamiento autorizados*: `https://hugofernandezcalvete.es/pulso/google/callback` (y `http://localhost:5000/pulso/google/callback` para probar en local)
5. Añade al stack de Portainer (*Environment variables*):
   - `GOOGLE_CLIENT_ID` = el ID de cliente
   - `GOOGLE_CLIENT_SECRET` = el secreto de cliente (no lo subas a GitHub)
   - `GOOGLE_REDIRECT_URI` = `https://hugofernandezcalvete.es/pulso/google/callback`

Cuota: 10 000 unidades al día para toda la web. Leer listas cuesta 1 unidad; cada búsqueda, 100.
