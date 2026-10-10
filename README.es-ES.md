# Local iTab

[简体中文](README.md) · [English](README.en.md) · [Español](README.es-ES.md)

Una página de nueva pestaña para Chrome centrada en tus datos locales. Reúne las búsquedas, tus sitios guardados y un pequeño panel personal para tener a mano lo que usas cada día.

**Uso sin conexión · Accesos directos por categorías · Diseño personalizable · Sincronización y copias opcionales**

No requiere compilación ni una cuenta de Local iTab. El reloj, la gestión de accesos directos, las imágenes locales y las tarjetas que completas manualmente funcionan sin conexión. Las búsquedas, las visitas a sitios web y las funciones opcionales en la nube necesitan acceso a Internet.

[Vista previa](#preview) · [Instalación](#install) · [Funciones](#features) · [Privacidad y copias](#privacy) · [Desarrollo](#development)

<a id="preview"></a>

## Vista previa

Capturas reales de distintas etapas del desarrollo de las funciones. Las plantillas muestran controles en inglés y categorías de ejemplo en chino; cada sección de funciones indica el idioma de sus capturas. La selección de sitios, los iconos y las tarjetas son ilustrativos; el tiempo, los temas y la película se introducen manualmente y no son datos en tiempo real.

[Verificación de plantillas estrechas, foco y conservación tras actualizar](docs/narrow-template-and-upgrade-validation.md)

### Interacciones recientes · Deshacer una finalización y notación científica

Puedes deshacer una finalización accidental sin volver a fijar la tarea automáticamente; se conservan el borrador y el filtro. Los resultados en notación científica pueden usarse en otro cálculo, por ejemplo `=1e-7*2`. Son capturas originales de escritorio de la versión de desarrollo 1.1.7, con el marco del navegador, sin recortar ni redibujar.

<details>
<summary>Ver Tareas oscuras en chino / inglés y la calculadora clara</summary>

![Tareas en chino: deshacer una finalización](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-zh.jpg)

![Tareas en inglés: borrador y filtro conservados](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-en.jpg)

![Calculadora en inglés: reutilizar notación científica](docs/screenshots/completion-calculator-1.1.7/calculator-scientific-light-en.jpg)

[Origen de las capturas](docs/screenshots/completion-calculator-1.1.7/capture-metadata.json)

</details>

### Funciones recientes · Tareas y concentración

Completa directamente la tarea fijada sin ampliar la lista. Iniciar permanece desactivado mientras los minutos no estén guardados; guardar la duración no inicia el temporizador. Capturas reales de la versión de desarrollo 1.1.7 con tareas de ejemplo en inglés: la interfaz clara en chino muestra 30 minutos guardados; el recorte oscuro en inglés muestra un borrador de 30 minutos mientras el temporizador conserva 25.

![Interfaz clara en chino: completar la tarea fijada y duración guardada](docs/screenshots/tasks-focus-1.1.7/tasks-focus-light-zh.png)

![Interfaz oscura en inglés: minutos sin guardar y botón Iniciar desactivado](docs/screenshots/tasks-focus-1.1.7/tasks-focus-draft-dark-en.png)

[Origen y recortes](docs/screenshots/tasks-focus-1.1.7/capture-metadata.json) · [Validación de tareas](docs/tasks-pinned-completion-validation.md) · [Protección del borrador](docs/focus-duration-draft-validation.md)

### Más acciones

Cada sitio guardado incluye ahora un botón visible “⋯” para abrir el menú existente de apertura, edición, eliminación y orden, también accesible con teclado. Estas capturas reales usan la interfaz en inglés y seis sitios de prueba; solo se recortaron, sin redibujar.

![Interfaz clara amplia con el menú de acciones de un sitio](docs/screenshots/shortcut-menu/more-light-wide.png)

<details>
<summary>Menú oscuro en ventana estrecha</summary>

![Interfaz oscura estrecha con el menú dentro del área visible](docs/screenshots/shortcut-menu/more-dark-narrow.png)

</details>

[Uso y alcance de validación](docs/shortcut-order.md) · [Versiones y recortes](docs/screenshots/shortcut-menu/capture-metadata.json)

**A / Clarity · Claro · Cuadrícula**

![Plantilla Clarity clara de Local iTab con accesos por categorías, búsqueda y reloj](docs/screenshots/clarity-light-grid.png)

### Doce plantillas nuevas · Claro / Oscuro

Capturas reales de las doce plantillas adicionales con la misma configuración de 18 sitios, controles en inglés y categorías en chino. Solo se recortaron el aviso de pruebas y la barra inferior del navegador; no se redibujó la interfaz. Las imágenes muestran el área visible al capturarlas; el contenido más largo continúa al desplazarse. El tiempo y las demás tarjetas contienen ejemplos introducidos manualmente, no datos en directo.

Los resúmenes siguientes son hojas de contacto de capturas reales reducidas proporcionalmente. Los enlaces incluyen las imágenes individuales y su procedencia y recorte.

![Doce plantillas claras: Atelier, Quiet, Studio, Console, Prism, Library, Horizon, Ledger, Meadow, Blueprint, Terrace y Column](docs/screenshots/templates/overview-light.png)

![Las doce plantillas oscuras en el mismo orden que la vista clara](docs/screenshots/templates/overview-dark.png)

[Ver las 24 capturas individuales y la guía en inglés](docs/template-gallery.en.md#screenshot-gallery) · [Origen y recorte de las capturas](docs/screenshots/templates/capture-manifest.json)

<details>
<summary>Más plantillas y capturas reales de funciones</summary>

### Funciones actuales

Capturas reales con datos de ejemplo y controles en inglés. Las imágenes están recortadas, sin redibujar la interfaz. Las capturas de tareas se centran en las tarjetas; las demás muestran el área visible al capturarlas. Parte del contenido requiere desplazarse.

**Tareas locales y temporizador · Claro / Oscuro**: la captura clara muestra una coincidencia para `review` y el botón para quitar el filtro; la oscura muestra las dos tareas sin filtrar.

![Tarjetas claras con una tarea filtrada y el temporizador](docs/screenshots/current-features/tasks-filter-light.png)

![Tarjetas oscuras con dos tareas sin filtrar y el temporizador](docs/screenshots/current-features/tasks-filter-dark.png)

**Calculadora local**: al escribir `=(12+3)/2` en la búsqueda, aparece `7.5`.

![Resultado de un cálculo local en el cuadro de búsqueda](docs/screenshots/current-features/calculator.png)

**Vista previa de importación de marcadores**: revisa las cantidades, la correspondencia de carpetas y los ajustes de privacidad antes de guardar.

![Vista previa de importación HTML de marcadores y controles de confirmación](docs/screenshots/current-features/bookmark-preview.png)

[Capturas originales, revisión y detalles de recorte](docs/screenshots/current-features/capture-manifest.json)

### Plantillas originales A / B / C y disposición libre

**B / Graphite · Oscuro · Grupos por categoría**

![Plantilla Graphite oscura de Local iTab con accesos agrupados por categoría](docs/screenshots/graphite-dark-grid.png)

**C / Folio · Claro · Grupos por categoría**

![Plantilla Folio clara de Local iTab con los primeros dos grupos y tarjetas de tiempo y temas de ejemplo](docs/screenshots/folio-light-grid.png)

**A / Clarity · Oscuro · Cuadrícula**

![Plantilla Clarity oscura de Local iTab con la misma configuración de ejemplo](docs/screenshots/clarity-dark-grid.png)

**B / Graphite · Claro · Grupos por categoría**

![Plantilla Graphite clara de Local iTab con accesos agrupados por categoría](docs/screenshots/graphite-light-grid.png)

**C / Folio · Oscuro · Grupos por categoría**

![Plantilla Folio oscura de Local iTab con los primeros dos grupos y tarjetas de tiempo y temas de ejemplo](docs/screenshots/folio-dark-grid.png)

**A / Clarity · Claro · Disposición libre sin ajuste a la cuadrícula**

![Disposición libre de Clarity clara tras arrastrar GitHub, con el estado guardado visible](docs/screenshots/free-layout.png)

</details>

<a id="install"></a>

## Instalación y primeros pasos

1. Descarga y descomprime el código fuente del repositorio, o clona este repositorio. El código se puede cargar directamente, sin compilar.
2. Abre `chrome://extensions/` en Chrome y activa el **Modo de desarrollador**.
3. Haz clic en **Cargar descomprimida** y selecciona **la carpeta que contiene directamente `manifest.json`**, normalmente `chrome-local-itab/` o la carpeta del repositorio extraído. No selecciones el ZIP ni la carpeta superior.
4. Abre una nueva pestaña, añade tus sitios favoritos y entra en Configuración para ajustar el aspecto, la búsqueda y los módulos.

Después de actualizar el código, pulsa **Recargar** en la página de extensiones y actualiza las páginas de nueva pestaña y Configuración que tengas abiertas. Exporta una copia antes de desinstalar la extensión o borrar sus datos.

Usa Chrome con soporte para Manifest V3. La protección frente a escrituras simultáneas de accesos directos y de su colocación también utiliza `navigator.locks`; si la API necesaria no está disponible, estas escrituras fallan y se muestra un error.

**Recordatorio de copias:** El JSON de configuración y las instantáneas de Drive no incluyen Tareas, el temporizador, el bloc ni la cuenta atrás. Exporta/importa Tareas por separado; exporta el bloc y la cuenta atrás como archivos de texto separados. Las sesiones del temporizador no se pueden migrar. Las preferencias de relojes mundiales forman parte de los ajustes. Antes de desinstalar o borrar datos, guarda las copias necesarias siguiendo la [lista de migración en inglés](docs/migration.en.md).

<a id="features"></a>

## Funciones

- **Exportar marcadores del navegador**: En Ajustes → Datos, exporta títulos, URL completas y carpetas de categorías guardadas a un archivo HTML local. Revisa la confirmación de privacidad; se excluyen cambios sin guardar, iconos, ajustes y herramientas locales. [Alcance y límites](docs/bookmark-export.md).

- **Buscar y navegar**: Usa Google, Bing, DuckDuckGo o una URL de búsqueda personalizada, o abre un sitio directamente. En una plantilla personalizada, `%s` representa el término de búsqueda; por ejemplo, `https://example.com/search?q=%s`.
- **Accesos directos organizados**: Añade, edita y elimina sitios; filtra por categoría; elige Cuadrícula (predeterminada, con reordenación al arrastrar), colocación libre (sin ajuste) o colocación manual con ajuste a la cuadrícula desde la página principal o Configuración. Cambiar de modo conserva las posiciones guardadas. El menú contextual incluye acciones para cada acceso y una opción para abrir todos los sitios de una categoría.
- **Quince plantillas de trabajo**: Se conservan A / Clarity, B / Graphite y C / Folio y se añaden doce diseños, todos con colores claros y oscuros. Una instalación nueva sigue usando A/claro. Cambiar de estilo solo guarda la apariencia: conserva sitios, categorías, tareas, fondos, colocación y coordenadas. Los estilos agrupados usan categorías reales; la disposición libre conserva su plano de coordenadas. [Guía de estilos (en inglés)](docs/template-gallery.en.md).
- **Diseño a tu gusto**: Usa el fondo de la plantilla, un color sólido o una imagen local. Ajusta las columnas, el espaciado, los iconos y los títulos, y muestra u oculta cada módulo.
- **Tarjetas locales sencillas**: Reloj, tiempo, temas de interés, película y una frase personal. Las tarjetas de tiempo, temas y películas se rellenan manualmente y están ocultas de forma predeterminada; no obtienen datos en tiempo real.
- **Copias locales en JSON**: Exporta la configuración y las imágenes locales, o importa una copia existente. La importación valida los datos y pide confirmación. Restaurar sustituye la configuración actual, así que conviene exportar una copia antes. Los archivos de más de 10 MiB muestran un aviso sobre el uso de memoria antes de leerlos y se pueden cancelar. La restauración de archivos grandes sigue dependiendo de la memoria disponible en el navegador. Se conserva el estado de sincronización del dispositivo actual.
- **Funciones opcionales en la nube**: Chrome Sync sincroniza ajustes ligeros; Google Drive guarda instantáneas manuales agrupadas por nombre del equipo. Su funcionamiento y sus límites se explican a continuación.

- **Buscar ajustes**: Busca nombres de ajustes en las seis pestañas y abre la sección con un clic o el teclado. La consulta es temporal y local; se excluyen el contenido guardado y los valores de los campos. [Guía en inglés](docs/settings-search.md#english).

Configuración guarda solo los campos modificados y conserva los borradores en conflicto para revisarlos. El selector de buscador y los controles para mostrar u ocultar el panel conservan la URL personalizada, los estilos de accesos directos y las demás preferencias guardadas más recientes. Abre páginas nuevas de Configuración y del panel después de una restauración completa, un restablecimiento o la aplicación de una instantánea de Chrome Sync. [Protección del guardado y alcance (en inglés)](docs/settings-save-safety.md#english).

## Búsqueda y gestión de sitios

### Buscar sitios guardados

El buscador local encuentra títulos, direcciones y categorías guardados sin enviar consultas a la web. Comprueba el registro actual antes de abrirlo y no modifica la disposición ni las tareas. [Guía del buscador (en inglés)](docs/shortcut-finder.en.md).

### Importar marcadores del navegador

Previsualiza y añade marcadores desde una exportación HTML local de Chrome, Edge o Firefox sin reemplazar el panel guardado. Revisa duplicados, categorías y preferencias actuales de sincronización e iconos antes de aplicar. [Guía de importación](docs/bookmark-import.es-ES.md).

Después de eliminar un acceso directo, **Undo delete** permite deshacer la última eliminación en esa misma página. Recargar la página borra esta opción; los cambios posteriores pueden impedir la restauración. [Alcance y seguridad](docs/shortcut-undo.md).

### Calculadora local

Empieza la búsqueda con `=` y pulsa Enter o Calcular, por ejemplo `=(12 + 3) / 2` → `7.5`. Admite decimales, signos unarios `+`/`-`, `+ - * /` y paréntesis. Las expresiones, resultados y errores permanecen en esta pestaña: sin búsquedas, historial ni almacenamiento, incluso sin configurar la URL del buscador personalizado. Quita `=` para volver a buscar. Al editar se borra el resultado anterior.

Tras calcular, usa Tab para llegar al campo de resultado de solo lectura y seleccionar el valor exacto; pulsa Ctrl/Cmd+C para copiarlo con el navegador. El cálculo mantiene el foco en la expresión; editar o iniciar composición IME borra el campo. El resultado puede mostrarse en notación científica y pegarse en otro cálculo, por ejemplo `=1e-7 * 2`.

<details>
<summary>Alcance y precisión de la calculadora</summary>

Límites: 256 caracteres después de `=` y 32 niveles combinados de paréntesis y signos unarios. Usa números de coma flotante de JavaScript: hay redondeo decimal, subdesbordamiento y límites de precisión para enteros grandes (`=0.1 + 0.2` da `0.30000000000000004`). No sirve para cálculos financieros exactos. La división por cero y los resultados no finitos muestran errores locales. Los decimales admiten `e`/`E` opcional, un signo `+`/`-` opcional y uno o más dígitos de exponente, sin espacios dentro del número (por ejemplo `.5E+2`). Los dígitos del exponente cuentan dentro del límite de 256 caracteres; el desbordamiento produce un error y el subdesbordamiento puede dar cero. No admite porcentajes, variables ni conversiones. La recarga por sincronización de ajustes se aplaza mientras haya una expresión; una recarga explícita puede descartarla.

</details>

## Herramientas locales de productividad

### Tareas locales

Activa la tarjeta opcional de Tareas en los ajustes de visibilidad de módulos. Está desactivada de forma predeterminada y comienza vacía. Permite añadir, editar y completar tareas, filtrar por texto en todos los estados, fijar una como siguiente acción y recuperar elementos eliminados. El filtro es local y no busca en la web.

Las tareas y sus copias de recuperación permanecen en este dispositivo. Las exportaciones de ajustes, Chrome Sync y las copias de Google Drive no las incluyen. Restablecer, importar o restaurar los ajustes conserva las tareas. Usa la exportación e importación independiente de tareas para hacer copias y cambiar de dispositivo. Desinstalar la extensión o borrar sus datos puede eliminar las tareas locales. [Guía de tareas (en inglés)](docs/local-tasks.en.md).

### Temporizador de concentración local

Activa la tarjeta opcional en Ajustes. Está oculta de forma predeterminada y propone 25 minutos de concentración y 5 de descanso. Antes de iniciar, cada fase admite entre 1 y 180 minutos enteros. Iniciar, pausar/reanudar y detener/restablecer son acciones manuales; elegir la siguiente fase no la inicia.

Todas las páginas abiertas de la extensión comparten una sesión local del dispositivo. Ocultar la tarjeta conserva la sesión. Restablecer solo los ajustes conserva su estado exacto; cambiar de plantilla o importar la configuración no la inicia ni la reemplaza. Las exportaciones de configuración, Chrome Sync y las copias de Drive excluyen el temporizador. No tiene asociación con tareas, historial, sonido, solicitudes de red ni notificaciones del sistema y no requiere nuevos permisos.

<details>
<summary>Límites de tiempo y recuperación</summary>

Con una página activa, el tiempo transcurrido se comprueba con un reloj monotónico. Tras cerrar todas las páginas, al volver se estima el tiempo restante con el reloj del dispositivo; un cambio del reloj durante ese intervalo no se puede distinguir del tiempo transcurrido. Si se detecta una discrepancia, se pide restablecer. La finalización se muestra localmente, sin prometer avisos puntuales cuando todas las páginas están cerradas. Si falla el almacenamiento, usa la opción de leer el estado más reciente: un fallo de confirmación puede ocurrir después de guardar, así que comprueba el estado antes de reintentar.

</details>

### Bloc de notas local

Activa Scratchpad en Ajustes → Visibilidad de módulos para guardar texto, enlaces o fragmentos. Está desactivado de forma predeterminada y guarda automáticamente en este dispositivo al dejar de escribir. Si hay cambios en otra pestaña, conserva el borrador y permite elegir entre el texto guardado y tu versión. Puedes exportar el borrador actual como TXT o seleccionar un archivo TXT UTF-8 para previsualizarlo y reemplazar explícitamente la nota guardada. La importación requiere una nota sin cambios pendientes y admite hasta 32.000 caracteres Unicode / 128 KiB; cancelar no modifica nada. [Importación, límites y recuperación (en inglés)](docs/local-scratchpad.en.md).

El bloc no se incluye en la exportación de configuración, Chrome Sync ni las copias de Google Drive. Expórtalo por separado antes de desinstalar o borrar los datos del navegador. [Alcance y validación](docs/local-scratchpad-validation.md).

<details>
<summary>Capturas de importación TXT del bloc</summary>

![Vista previa de importación TXT: interfaz real clara en inglés](docs/screenshots/scratchpad-import/scratchpad-import-light-wide.png)

![Vista previa de importación TXT: interfaz real oscura en inglés](docs/screenshots/scratchpad-import/scratchpad-import-dark-wide.png)

[Procedencia y recorte de capturas](docs/screenshots/scratchpad-import/capture-metadata.json)

</details>

### Calendario mensual local

Abre **Calendar** debajo de la fecha del reloj para consultar los meses sin conexión. **Previous / Next / Today** cambian la vista; las fechas son solo de consulta, sin eventos ni recordatorios. No guarda el mes consultado ni tiene estado que copiar o sincronizar. [Guía en inglés](docs/month-calendar.en.md) · [Alcance de la validación](docs/month-calendar-validation.md).

<details>
<summary>Capturas y dimensiones del calendario</summary>

La captura clara amplia usa chino simplificado; la oscura estrecha usa inglés.

![Calendario real en chino simplificado, en ventana clara amplia con la fecha localizada](docs/screenshots/month-calendar/calendar-light-wide.png)

![Calendario real en inglés, en ventana oscura estrecha con la fecha y el calendario desplegado](docs/screenshots/month-calendar/calendar-dark-narrow.png)

[Capturas y dimensiones del calendario](docs/screenshots/month-calendar/capture-metadata.json)

</details>

### Relojes mundiales sin conexión

Añade hasta cuatro zonas horarias IANA en Ajustes → Apariencia. Puedes asignar una etiqueta, ver su hora y saber si allí es hoy, ayer o mañana respecto a tu fecha local. No requiere ubicación, servicios externos ni permisos nuevos; la lista empieza vacía.

Usa **Move up / Move down** para reordenar el borrador y pulsa Guardar relojes o Guardar ajustes para aplicar la lista. Los cambios guardados actualizan directamente los paneles abiertos. Estas preferencias forman parte de la configuración; sus copias y la sincronización opcional conservan el orden guardado. Si otra pestaña cambia el reloj, el guardado obsoleto se rechaza conservando tu borrador. [Guía en inglés](docs/world-clocks.en.md).

### Cuenta atrás local

Guarda un evento y una fecha para ver los días que faltan, «Hoy» o los días transcurridos según el calendario local del dispositivo. La tarjeta está oculta de forma predeterminada. Usa Ajustes → Search & cards para editarla, guardar o cancelar; ocultarla conserva sus datos.

El título y la fecha se guardan por separado en este dispositivo y quedan fuera de las exportaciones de configuración, Chrome Sync y Google Drive. Puedes exportarlos como texto, incluido un borrador sin guardar. No necesita servicios externos ni notificaciones. [Guía en inglés](docs/local-countdown.en.md).

<details>
<summary>Capturas de la cuenta atrás</summary>

Tarjeta real de cuenta atrás en modo claro y oscuro, con controles en inglés:

![Cuenta atrás local: interfaz clara real](docs/screenshots/countdown/countdown-en-light-wide.png)

![Cuenta atrás local: interfaz oscura real](docs/screenshots/countdown/countdown-en-dark-wide.png)

[Procedencia de las capturas](docs/screenshots/countdown/capture-metadata.json)

</details>

## Apariencia y espacios de trabajo

### Espacios de trabajo recomendados

Revisa y aplica la visibilidad local de Tareas y del temporizador por separado de la plantilla visual, conservando contenido y sesiones. [Guía](docs/workspace-presets.es-ES.md).

<a id="privacy"></a>

## Datos, privacidad y conexiones de red

**Recordatorio de copias:** El JSON de configuración y las instantáneas de Drive no incluyen Tareas, el temporizador, el bloc ni la cuenta atrás. Exporta/importa Tareas por separado; exporta el bloc y la cuenta atrás como archivos de texto separados. Las sesiones del temporizador no se pueden migrar. Las preferencias de relojes mundiales forman parte de los ajustes. Antes de desinstalar o borrar datos, guarda las copias necesarias siguiendo la [lista de migración en inglés](docs/migration.en.md).

### Cambiar de navegador o dispositivo

Las copias de configuración no incluyen Tasks, Focus timer, Scratchpad ni Countdown. Antes de desinstalar o borrar datos, guarda copias separadas siguiendo la [lista de migración en inglés](docs/migration.en.md).

La configuración, los accesos directos y las imágenes cargadas se guardan principalmente en `chrome.storage.local`. Los iconos de sitios usan una caché local en IndexedDB, y parte del estado de la interfaz se guarda en el almacenamiento local del navegador. La extensión no incluye scripts de analítica ni publicidad.

- **Búsqueda**: Escribir no envía el texto de búsqueda. Al enviar una búsqueda o abrir una URL, se visita el proveedor elegido o el sitio de destino.
- **Iconos de sitios**: Su descarga en línea está desactivada de forma predeterminada. Para activarla también debes conceder el permiso opcional `https://www.google.com/*` en el dispositivo actual. La extensión envía entonces los nombres de dominio al servicio de favicons de Google para obtener sus iconos. Los iconos válidos de la caché se pueden reutilizar sin conexión; la caché caduca actualmente a los siete días.
- **Tarjetas y fondos locales**: El contenido de tiempo, temas y películas, así como los fondos cargados, no depende de fuentes remotas.
- **Chrome Sync**: La configuración predeterminada lo mantiene desactivado. Al activarlo, los ajustes se comparten mediante `chrome.storage.sync`. Una instalación nueva puede leer y aplicar automáticamente una configuración de sincronización ya activada en la misma cuenta de Chrome.
- **Google Drive**: Requiere autorización de Google por separado. Conectar, actualizar la lista, crear copias, descargar, restaurar y eliminar instantáneas implica acceder a las API de Google. No hay copias automáticas programadas.

Priorizar el uso sin conexión significa que la página principal puede funcionar localmente. Al activar funciones en la nube o visitar un sitio, el servicio correspondiente recibe los datos necesarios para esa acción.

### Chrome Sync: ajustes ligeros

Sincroniza accesos directos y ajustes entre navegadores que usan la misma cuenta de Chrome, según la disponibilidad de la sincronización y sus cuotas de almacenamiento. Las imágenes incrustadas de fondos, carteles e iconos se omiten o se sustituyen por valores predeterminados en los datos sincronizados. Usa la exportación JSON o las instantáneas de Drive si necesitas incluir las imágenes.

Las URL duplicadas pueden tener posiciones independientes sin perder las coordenadas anteriores. Las copias con identidades usan el esquema 2 y requieren una versión actualizada para importarlas. Los clientes antiguos pueden eliminar estos campos; Chrome Sync conserva los datos locales y pide revisión si las copias son incompatibles. Consulta [posiciones independientes, compatibilidad y recuperación](docs/layout-identities.md).

### Google Drive: instantáneas manuales

- Conecta Google Drive desde Configuración y elige un nombre de equipo para las copias.
- Las instantáneas incluyen la configuración y las imágenes locales. Se guardan en la carpeta oculta `appDataFolder` de Drive, con el ámbito de autorización `drive.appdata`.
- Puedes consultar, descargar, restaurar o eliminar instantáneas por nombre de equipo. Tras una copia normal, la extensión intenta eliminar las más antiguas de ese equipo y conservar las 20 últimas.
- Cada instantánea tiene un límite de 25 MiB. Las que superan los 5 MiB requieren una confirmación adicional.
- Antes de restaurar desde Drive, la extensión intenta subir la configuración actual como instantánea de seguridad. Si falla, pregunta si quieres continuar. La restauración sustituye la configuración actual de este dispositivo.

Esta función depende de la API Chrome Identity, de una configuración OAuth válida y de la autorización de Google. Comprueba esa configuración en instalaciones de desarrollo o empaquetadas por tu cuenta. El uso local y la importación o exportación JSON no dependen de Drive.

### Permisos de la extensión

Los permisos declarados en [manifest.json](manifest.json) incluyen:

- `storage` y `unlimitedStorage`: configuración e imágenes locales.
- `identity` y `https://www.googleapis.com/*`: autorización y copias opcionales en Google Drive.
- El permiso opcional `https://www.google.com/*`: descarga de iconos de sitios.

## Idiomas de la documentación y de la interfaz

El README predeterminado está en [chino simplificado](README.md), con versiones en [inglés](README.en.md) y español.

La extensión incluye actualmente recursos de interfaz en chino simplificado (`_locales/zh_CN`) e inglés (`_locales/en`). Usa el idioma del navegador mediante `chrome.i18n`, con el inglés como alternativa predeterminada. El español solo está disponible en la documentación por ahora.

La fecha completa del reloj principal, incluido el orden de la fecha y los nombres del día y del mes, sigue una etiqueta de idioma explícita en los mensajes chinos o ingleses mostrados, con el mensaje predefinido de Chrome `@@ui_locale`, el idioma de la interfaz de Chrome, el idioma preferido del navegador y la configuración regional del entorno como alternativas si no está disponible o es inválido. Las etiquetas del día del año y de la semana ISO también usan el idioma de la interfaz. No cambian el formato de la hora ni los marcadores de fecha de las frases personalizadas. El texto de bienvenida recién generado se localiza; las frases guardadas o importadas (incluida la bienvenida anterior en inglés) no se traducen ni migran. Se conserva la validación existente, incluido el recorte de espacios y la bienvenida en inglés para cadenas vacías. Si falta el campo de frase, se usa el nuevo valor predeterminado localizado.

<a id="development"></a>

## Desarrollo y comprobaciones locales

El proyecto utiliza Manifest V3, JavaScript sin bibliotecas externas y CSS. No requiere instalar dependencias ni generar un paquete. Con Node.js instalado, ejecuta estos comandos desde la raíz del repositorio:

```bash
# Ejecutar todas las pruebas de regresión
node --test tests/*.test.js

# Comprobar la sintaxis JavaScript
for file in *.js shared/*.js tests/*.js tests/helpers/*.js assets/*.js; do
  node --check "$file" || exit 1
done

# Validar el manifiesto y los archivos JSON de idiomas
node -e 'const fs = require("node:fs"); for (const file of ["manifest.json", ...fs.readdirSync("_locales").map(locale => "_locales/" + locale + "/messages.json")]) JSON.parse(fs.readFileSync(file, "utf8")); console.log("JSON OK");'

git diff --check
```

Estas comprobaciones cubren regresiones de lógica, sintaxis JavaScript y validez de JSON; no sustituyen las pruebas en un navegador real. Antes de publicar, carga la extensión descomprimida y comprueba ambos idiomas de la interfaz, el uso del teclado, el arrastre, la edición entre pestañas, la restauración de copias y los flujos opcionales en línea. Consulta también la [lista de comprobación para publicar](docs/release-checklist.md).

### Crear y verificar un ZIP de la extensión

El desarrollo con la extensión descomprimida no requiere compilación. Para crear un ZIP sin conexión con solo los archivos de ejecución, usa Python 3.10+ (solo la biblioteca estándar) desde la raíz del repositorio:

```bash
python3 tools/package_extension.py --output dist/local-itab-current.zip
python3 tools/package_extension.py --verify dist/local-itab-current.zip
python3 -m unittest discover -s tests -p '*_test.py'
```

Los comandos anteriores usan explícitamente `dist/local-itab-current.zip`, ignorado por Git. Sin `--output`, el nombre usa la versión de `manifest.json`: `dist/local-itab-<versión>.zip`. Nunca se sobrescriben archivos existentes; usa `--output /path/to/new-package.zip` para otro destino. Las salidas dentro del repositorio deben estar en `dist/`. Los archivos históricos `release/*.zip` se conservan y no se usan para generar el paquete actual.

La lista explícita incluye los módulos compartidos, ambos idiomas de la interfaz y los iconos utilizados. La comprobación falla si falta un archivo de la lista o una referencia local de script/link/image en HTML, `url()`/`@import` en CSS o entradas/iconos del manifest. Añade las dependencias nuevas a `RUNTIME_FILES` en la herramienta; las rutas generadas por JavaScript y las importaciones dinámicas aún necesitan revisión manual. Se excluyen pruebas, documentación, capturas, herramientas, archivos fuera de la lista y paquetes antiguos. El ZIP usa rutas ordenadas, fechas fijas y bytes sin compresión para ser reproducible.

El comando muestra la revisión Git y el estado de los cambios locales (o indica que no están disponibles en una descarga del código), el número de archivos y el SHA256 del ZIP. `--verify` compara el ZIP con los bytes del código actual y sus metadatos canónicos; un paquete de otra revisión puede fallar. Esto verifica el empaquetado, no las pruebas en el navegador ni la aprobación de publicación. Antes de subirlo, extrae el nuevo ZIP en otro directorio, cárgalo en Chrome y completa la [lista de publicación](docs/release-checklist.md). El empaquetado no cambia la versión del manifest ni publica la extensión.

**Política de commits y publicaciones:** Crea un commit por función o corrección y envíalo al repositorio remoto sin demora; `master` puede adelantarse a la versión aprobada en la tienda. Los commits de Git identifican cambios del código y `version` en `manifest.json` identifica la versión de la extensión. Un sufijo con el hash abreviado del código en el nombre de un paquete de prueba solo permite rastrear su commit; no es una versión de la extensión. Puede indicarse mediante `--output`, pero no se añade automáticamente. Prepara como máximo una versión consolidada para enviar a la tienda por día natural (UTC+08), solo con cambios nuevos ya probados y ninguna versión en revisión; de lo contrario, no publiques. Conserva intactos los paquetes ya subidos e incluye las correcciones posteriores en otra versión. Los paquetes de prueba de desarrollo y las correcciones individuales no implican automáticamente un aumento de versión ni una publicación en la tienda. Esta política no garantiza disponibilidad diaria en la tienda ni plazos de revisión.

### Estructura del código

- `newtab.html` / `newtab.css` / `newtab.js`: interfaz e interacciones de la nueva pestaña.
- `options.html` / `options.css` / `options.js`: configuración y gestión de datos.
- `storage.js`: almacenamiento local, validación, importación, exportación y Chrome Sync.
- `drive-backup.js`: instantáneas de copia de seguridad en Google Drive.
- `favicon-cache.js`: caché de iconos de sitios.
- `shared/`: lógica compartida para plantillas de búsqueda y diálogos.
- `_locales/`: traducciones de la interfaz; `assets/`: iconos y capturas; `tests/`: pruebas locales de regresión.

## Licencia

La documentación existente identifica la licencia como MIT. El repositorio todavía no incluye un archivo `LICENSE` independiente.
