# Contenido de la página «Proyectos» (/proyectos).
# Cada proyecto: textos, lista de funciones, tecnologías y capturas o vídeos
# (guardados en app/static/proyectos/). Para añadir uno nuevo basta con
# añadir otro diccionario a la lista.

proyectos = [
    {
        "id": "home-cloud",
        "titulo": "Home Cloud",
        "icono": "fa-solid fa-cloud",
        "etiqueta": "Nube personal",
        "resumen": (
            "Una alternativa sencilla a los servicios de almacenamiento en la nube, "
            "funcionando en una Raspberry Pi de casa. Cada usuario tiene su espacio "
            "y lo gestiona desde el navegador."
        ),
        "puntos": [
            "Subir, descargar, renombrar y borrar archivos.",
            "Carpetas dentro de carpetas, con ruta de navegación.",
            "Espacio máximo por usuario, que decide un administrador.",
            "Barra de espacio usado y libre (descontando lo reservado para grupos).",
            "Nombres de archivo saneados y rutas que no pueden salirse de la carpeta del usuario.",
        ],
        "tecnologias": ["Flask", "SQLite", "Jinja2", "Docker"],
        "media": [
            {"tipo": "img", "src": "proyectos/nube.webp", "alt": "Página Mis archivos con carpetas, archivos y barra de espacio",
             "pie": "Mis archivos: carpetas, archivos y espacio disponible."},
        ],
        "enlace": {"texto": "Abrir mi nube", "ruta": "/HomeCloud/dashboard"},
    },
    {
        "id": "compartir",
        "titulo": "Carpetas compartidas",
        "icono": "fa-solid fa-share-nodes",
        "etiqueta": "Nuevo",
        "resumen": (
            "Cualquier carpeta de tu nube se puede compartir con otros usuarios "
            "registrados, eligiendo si solo pueden verla o también editarla."
        ),
        "puntos": [
            "Permiso «ver y descargar» o «editar» (subir, crear carpetas y borrar) para cada persona.",
            "Lo que suben los demás ocupa espacio del propietario.",
            "Si renombras la carpeta, la compartición la sigue; si la borras, desaparece.",
            "Sección «Compartido» con lo que te comparten y lo que compartes tú.",
            "Las carpetas compartidas se marcan en Mis archivos con el número de personas.",
            "Carpetas públicas: cualquiera puede verlas y descargarlas sin cuenta, con un enlace secreto y, si quieres, en el listado público.",
        ],
        "tecnologias": ["Flask", "SQLAlchemy", "Permisos"],
        "media": [
            {"tipo": "img", "src": "proyectos/compartir.webp", "boton": "Compartir", "alt": "Página para compartir la carpeta Apuntes con dos usuarios",
             "pie": "Compartir una carpeta y elegir el permiso de cada persona."},
            {"tipo": "img", "src": "proyectos/compartido.webp", "boton": "Compartido", "alt": "Sección Compartido con tarjetas de carpetas recibidas",
             "pie": "Lo que te han compartido, de un vistazo."},
            {"tipo": "img", "src": "proyectos/publico.webp", "boton": "Públicas", "alt": "Listado de carpetas públicas con su autor, archivos y tamaño",
             "pie": "Carpetas públicas: se ven y se descargan sin cuenta."},
        ],
        "enlace": {"texto": "Ver carpetas públicas", "ruta": "/publico"},
    },
    {
        "id": "grupos",
        "titulo": "Grupos",
        "icono": "fa-solid fa-people-roof",
        "etiqueta": "Nuevo",
        "resumen": (
            "Espacios compartidos entre varios usuarios, con sus propios chats, "
            "carpetas y archivos. Quien crea el grupo decide el espacio y lo que "
            "puede hacer cada miembro."
        ),
        "puntos": [
            "Los miembros entran aceptando una invitación, desde Grupos o desde su perfil.",
            "El espacio del grupo sale del de su creador y solo puede reservar lo que tiene libre.",
            "Seis permisos por miembro: subir, crear carpetas, borrar, escribir, crear chats y añadir miembros.",
            "Todos los miembros pueden ver los archivos y leer los chats.",
            "El creador puede ampliar o reducir el espacio, quitar miembros o borrar el grupo.",
            "Los administradores de la web pueden entrar y gestionar cualquier grupo.",
        ],
        "tecnologias": ["Flask", "SQLAlchemy", "Control de acceso"],
        "media": [
            {"tipo": "img", "src": "proyectos/grupos.webp", "boton": "Mis grupos", "alt": "Invitación pendiente y tarjetas de grupos con miembros, chats, espacio y mensajes sin leer",
             "pie": "Invitaciones pendientes y mis grupos, con mensajes sin leer."},
            {"tipo": "img", "src": "proyectos/miembros.webp", "boton": "Permisos", "alt": "Tabla de miembros con interruptores de permisos",
             "pie": "Permisos de cada miembro con interruptores."},
        ],
        "enlace": {"texto": "Ir a mis grupos", "ruta": "/HomeCloud/grupos/"},
    },
    {
        "id": "chat",
        "titulo": "Chat en directo",
        "icono": "fa-regular fa-comments",
        "etiqueta": "Nuevo",
        "resumen": (
            "Mensajería interna dentro de cada grupo. Los mensajes llegan al "
            "instante gracias a WebSocket, implementado desde cero sin librerías."
        ),
        "puntos": [
            "Servidor WebSocket propio (RFC 6455) dentro de la app Flask, sin dependencias nuevas.",
            "Varios chats por grupo, con mensajes sin leer y quién está conectado.",
            "Historial por páginas, enlaces clicables y el texto siempre escapado (sin HTML).",
            "Cada uno borra sus mensajes; el creador del grupo, cualquiera.",
            "Si el WebSocket no puede conectar, el chat sigue funcionando consultando cada pocos segundos.",
        ],
        "tecnologias": ["WebSocket", "JavaScript", "Hilos", "Gunicorn"],
        "media": [
            {"tipo": "video", "src": "proyectos/chat.mp4", "poster": "proyectos/chat.webp",
             "alt": "Dos ventanas del mismo chat: lo que escribe una persona aparece al momento en la otra",
             "pie": "Dos usuarios en el mismo chat: los mensajes aparecen al momento."},
        ],
        "enlace": {"texto": "Abrir los chats", "ruta": "/HomeCloud/grupos/"},
    },
    {
        "id": "avisos",
        "titulo": "Avisos por correo",
        "icono": "fa-regular fa-envelope",
        "etiqueta": "Nuevo",
        "resumen": (
            "Cada usuario confirma su correo y elige qué avisos quiere recibir: "
            "mensajes nuevos, grupos, carpetas compartidas, archivos o su cuenta."
        ),
        "puntos": [
            "Confirmación del correo con un enlace firmado que caduca a los 2 días.",
            "Cinco tipos de aviso que se activan o desactivan por separado.",
            "El correo se puede cambiar o desvincular de la cuenta en cualquier momento.",
            "Sin spam: como mucho un correo por chat cada 20 minutos y solo si no lo tienes abierto.",
            "Los correos salen en segundo plano por SMTP (Gmail), sin hacer esperar a nadie.",
        ],
        "tecnologias": ["SMTP", "itsdangerous", "HTML para correo"],
        "media": [
            {"tipo": "img", "src": "proyectos/perfil.webp", "boton": "Configuración", "alt": "Configuración del perfil por apartados: datos, contraseña, correo y avisos, invitaciones, carpetas públicas y eliminar cuenta",
             "pie": "La configuración, por apartados."},
            {"tipo": "img", "src": "proyectos/avisos.webp", "boton": "Preferencias", "alt": "Perfil con los interruptores de avisos por correo",
             "pie": "Preferencias de avisos en el perfil."},
            {"tipo": "img", "src": "proyectos/correo.webp", "boton": "El correo", "alt": "Correo de aviso de mensajes nuevos en un chat",
             "pie": "Así llega un aviso de mensajes nuevos."},
        ],
        "enlace": {"texto": "Configurar mis avisos", "ruta": "/perfil#avisos"},
    },
    {
        "id": "pixel-art",
        "titulo": "Pixel Art",
        "icono": "fa-solid fa-palette",
        "etiqueta": "Tiempo real",
        "resumen": (
            "Un lienzo de 512 × 512 compartido por todo el que entra en la web. "
            "Lo que pinta cada persona lo ven los demás en directo."
        ),
        "puntos": [
            "Lienzo común guardado en la base de datos, casilla a casilla.",
            "«Tinta» por persona que se recarga con el tiempo, para que nadie lo acapare.",
            "Solo viajan los cambios desde la última consulta, no el lienzo entero.",
            "Zoom, paleta de colores y uso con teclado.",
        ],
        "tecnologias": ["Canvas 2D", "JavaScript", "Flask API"],
        "media": [
            {"tipo": "img", "src": "proyectos/pixel.webp", "alt": "Lienzo de Pixel Art con dibujos de varios usuarios",
             "pie": "El lienzo compartido."},
        ],
        "enlace": {"texto": "Pintar", "ruta": "/pixel-art/"},
    },
    {
        "id": "pulso",
        "titulo": "Pulso",
        "icono": "fa-solid fa-wave-square",
        "etiqueta": "Música visual",
        "resumen": (
            "Un fondo que se enciende con la música. Escucha lo que tienes en tu nube "
            "o conecta Google para traer tus listas de YouTube y YouTube Music."
        ),
        "puntos": [
            "Visualizador en WebGL que reacciona al audio real con Web Audio.",
            "Música de tu propia nube, respetando tu espacio.",
            "Inicio de sesión con Google para ver tus listas y recomendaciones.",
        ],
        "tecnologias": ["WebGL", "Web Audio", "OAuth 2.0", "YouTube API"],
        "media": [
            {"tipo": "img", "src": "proyectos/pulso.webp", "alt": "Pantalla de Pulso con el visualizador de fondo",
             "pie": "Pulso, listo para encender la música."},
        ],
        "enlace": {"texto": "Encender la música", "ruta": "/pulso"},
    },
    {
        "id": "curriculum",
        "titulo": "Currículum interactivo",
        "icono": "fa-regular fa-id-card",
        "etiqueta": "Con sorpresa",
        "resumen": (
            "Mi perfil profesional con las tecnologías en órbita alrededor de un planeta, "
            "modo claro y oscuro y el CV listo para descargar en PDF."
        ),
        "puntos": [
            "Órbitas de tecnologías dibujadas con WebGL.",
            "Formación, experiencia, idiomas y contacto.",
            "Easter egg: Investiga y descúbrelo.",
        ],
        "tecnologias": ["WebGL", "Web Audio", "CSS"],
        "media": [
            {"tipo": "img", "src": "proyectos/cv.webp", "alt": "Página de currículum con el planeta y las órbitas de tecnologías",
             "pie": "El currículum con las órbitas de tecnologías."},
        ],
        "enlace": {"texto": "Ver mi perfil", "ruta": "/info"},
    },
    {
        "id": "admin",
        "titulo": "Administración",
        "icono": "fa-solid fa-shield-halved",
        "etiqueta": "Para administradores",
        "resumen": (
            "Un panel para aprobar cuentas, repartir el espacio y supervisar "
            "todos los grupos y carpetas compartidas."
        ),
        "puntos": [
            "Aprobar o rechazar registros, suspender cuentas y dar permisos de administrador.",
            "Espacio de cada usuario (avisa si es menor que lo que tiene reservado en grupos).",
            "Lista de todos los grupos: entrar, gestionar miembros o borrarlos.",
            "Lista de todas las carpetas compartidas, con opción de retirarlas.",
        ],
        "tecnologias": ["Flask", "Roles", "SQLAlchemy"],
        "media": [
            {"tipo": "img", "src": "proyectos/admin.webp", "alt": "Panel de administración con la lista de grupos",
             "pie": "Todos los grupos, desde el panel de administración."},
        ],
        "enlace": None,
    },
]

# Cómo está montado (sección final, sin capturas)
infraestructura = [
    {"icono": "fa-brands fa-raspberry-pi", "titulo": "Raspberry Pi",
     "texto": "Todo funciona en una Raspberry Pi en casa, con Docker y Portainer."},
    {"icono": "fa-brands fa-github", "titulo": "Despliegue desde GitHub",
     "texto": "Portainer construye la imagen desde el repositorio y la vuelve a desplegar con un clic."},
    {"icono": "fa-solid fa-server", "titulo": "Gunicorn + Nginx",
     "texto": "Gunicorn sirve la app y Nginx hace de proxy con HTTPS, WebSocket y filtros contra bots."},
    {"icono": "fa-brands fa-cloudflare", "titulo": "Cloudflare",
     "texto": "El dominio pasa por Cloudflare; la app recibe la IP real de cada visitante."},
    {"icono": "fa-solid fa-lock", "titulo": "Seguridad",
     "texto": "CSRF en todos los formularios, cookies seguras, HSTS y cabeceras de seguridad."},
    {"icono": "fa-solid fa-user-xmark", "titulo": "Tus datos, tuyos",
     "texto": "Cada usuario puede eliminar su cuenta y todos sus datos desde su perfil, cuando quiera."},
    {"icono": "fa-solid fa-circle-half-stroke", "titulo": "Modo claro y oscuro",
     "texto": "Toda la web cambia de tema y lo recuerda en cada visita."},
]
