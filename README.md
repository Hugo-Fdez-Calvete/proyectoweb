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

# Dependencias

Las dependencias necesarias para ejecutar el proyecto se encuentran en:

requirements.txt

Para instalarlas:

pip install -r requirements.txt

## Futuras mejoras

Algunas funcionalidades que podrían incorporarse en futuras versiones son:

- Sistema de múltiples usuarios.
- Gestión del espacio de almacenamiento.
- Creación de carpetas.
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