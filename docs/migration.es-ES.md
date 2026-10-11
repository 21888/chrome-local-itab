# Cambiar de navegador o dispositivo

Conserva la instalación original hasta comprobar los datos restaurados. Eliminar la extensión o borrar los datos del navegador puede eliminar el contenido local. Los archivos descargados no se suben ni sincronizan automáticamente.

## Migración completa de datos guardados

Usa la [copia local completa](complete-backup.es-ES.md). Puedes elegir siete módulos: configuración, Tasks, Scratchpad, Countdown y preferencias de Focus por espacio, más prompts y colecciones de IA globales. Incluye los espacios recuperables de la papelera y las versiones guardadas de prompts y colecciones.

Guarda los borradores, exporta y comprueba el archivo descargado. En el destino, exporta primero los datos existentes. Revisa el alcance de reemplazo de espacios y confirma por separado cada destino global. Un archivo antiguo schema 1 exige elegir un espacio activo de destino. Las colecciones conservan vínculos exactos; pueden quedar sin resolver si no restauras las versiones de prompts correspondientes.

Tras confirmar la restauración, vuelve a abrir las páginas y comprueba todos los espacios, la papelera, las versiones antiguas de prompts y los extractos vinculados. Los módulos no seleccionados permanecen intactos. La copia previa de recuperación contiene todos los módulos de espacios y solo las bibliotecas globales seleccionadas. Si hay una escritura incierta, usa la inspección y recuperación explícita; recargar no garantiza resolverla.

## Alternativas individuales

- Configuración: exporta/importa el JSON de Ajustes. Contiene sitios, categorías, diseño, apariencia, imágenes y relojes mundiales; excluye Tasks, Scratchpad, Countdown, Focus y las bibliotecas globales. Chrome Sync, Drive y recuperación de configuración tampoco incluyen esos módulos.
- Tasks: exporta/importa su JSON mediante Task data. Revisa antes de reemplazar la lista y el elemento fijado; no es una fusión. Guarda primero las ediciones.
- Scratchpad: Export text conserva el borrador visible como TXT. Import text requiere revisión y confirmación antes de reemplazar. Guarda por separado los borradores en conflicto.
- Countdown: exporta TXT y revisa título y fecha. La tarjeta exporta datos guardados; Ajustes exporta el borrador actual. El TXT no es un formato de importación automática: introduce los valores y la visibilidad manualmente.
- Focus: las preferencias pueden migrarse con la copia completa. Sin ella, anota y configura manualmente duraciones y visibilidad. Las sesiones activas, pausadas o interrumpidas no son portátiles.
- Prompts y colecciones globales: selecciona ambos en la copia completa para conservar versiones vinculadas, o usa sus JSON individuales con revisión. Markdown/texto son copias legibles, no archivos completos de recuperación.

El calendario mensual usa la fecha del dispositivo y no necesita migración. Conserva los archivos en privado: pueden contener texto personal, prompts, extractos y URL completas.
