modulos = [
{
"titulo": "Proyectos web",
"icono": "fa-solid fa-laptop-code",
"ancho": True,
"ruta": "/",
"accion": "Ver proyectos",
"texto": (
"Mis proyectos web personales: lo que he construido para "
"aprender, probar ideas y resolver problemas reales.")},
{
"titulo": "Perfil y currículum",
"icono": "fa-regular fa-id-card",
"ancho": False,
"ruta": "/info",
"accion": "Ver mi perfil",
"texto": (
"Formación, experiencia, habilidades técnicas e idiomas. "
"Con el CV listo para descargar en PDF.")},
{
"titulo": "Pulso",
"icono": "fa-solid fa-wave-square",
"ancho": False,
"completo": True,
"ruta": "/pulso",
"accion": "Encender la música",
"texto": (
"Música que se ve: un fondo que se enciende con cada golpe. "
"Tu música guardada en tu nube o tu YouTube conectando Google.")},
{
"titulo": "Home Cloud",
"icono": "fa-solid fa-cloud",
"ancho": False,
"ruta": "/HomeCloud/dashboard",
"accion": "Abrir mi cloud",
"texto": (
"Mi nube personal. Sube, organiza y comparte archivos "
"con un enlace.")},
{
"titulo": "Mensajería interna",
"icono": "fa-regular fa-comments",
"ancho": False,
"ruta": "/",
"accion": "Abrir mensajería",
"texto": (
"Un sistema de mensajes propio para hablar con otros "
"usuarios de la web.")},
{
"titulo": "Y mucho más",
"icono": "fa-solid fa-flask",
"ancho": False,
"ruta": None,
"accion": "Se amplía con el tiempo",
"texto": (
"Experimentos, herramientas y novedades. "
"Esta web crece conmigo.")},
]

arranque = [
"cargando perfil",
"montando home cloud",
"activando mensajería interna",
"afinando el visualizador",
"listando proyectos",
"preparando novedades",
]
# proyectos que se enseñan en la tarjeta «Proyectos web» de la portada
destacados = [
{"nombre": "Home Cloud", "icono": "fa-solid fa-cloud", "tecnologias": "Flask · SQLite"},
{"nombre": "Pulso", "icono": "fa-solid fa-wave-square", "tecnologias": "Web Audio · WebGL"},
{"nombre": "Pixel Art", "icono": "fa-solid fa-palette", "tecnologias": "Canvas · Tiempo real"},
]
