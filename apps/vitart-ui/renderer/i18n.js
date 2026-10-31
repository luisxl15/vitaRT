// Idiomas do Troféus e do Mod Studio. O código e o HTML ficam em português; esta camada traduz o que aparece na
// página: cada texto (e placeholder, title, aria-label, data-vazio) que entra no DOM é procurado no dicionário.
// Chaves com {a}, {b}... valem como molde: "{a} instalados · {b} ligados" pega "3 instalados · 1 ligados".
// O que é dado (registro, guia, caminhos, nomes) fica fora: data-no-i18n no elemento.
const IDIOMAS = { pt: 'Português', en: 'English', es: 'Español', fr: 'Français', it: 'Italiano', de: 'Deutsch' };
const IDIOMA = (() => {
  try { const s = localStorage.getItem('idioma'); if (s in IDIOMAS) return s; } catch (_) { /* sem armazenamento */ }
  const l = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return l in IDIOMAS ? l : 'en';
})();

// [pt, en, es, fr, it, de]
const FRASES = [
  // ------------------------------------------------------------ comum
  ['Minimizar', 'Minimize', 'Minimizar', 'Réduire', 'Riduci', 'Minimieren'],
  ['Maximizar', 'Maximize', 'Maximizar', 'Agrandir', 'Ingrandisci', 'Maximieren'],
  ['Fechar', 'Close', 'Cerrar', 'Fermer', 'Chiudi', 'Schließen'],
  ['Confirmar', 'Confirm', 'Confirmar', 'Confirmer', 'Conferma', 'Bestätigen'],
  ['Cancelar', 'Cancel', 'Cancelar', 'Annuler', 'Annulla', 'Abbrechen'],
  ['Idioma', 'Language', 'Idioma', 'Langue', 'Lingua', 'Sprache'],
  ['A saída das ferramentas aparece aqui.', 'Tool output shows up here.', 'Aquí aparece la salida de las herramientas.', 'La sortie des outils apparaît ici.', "Qui compare l'output degli strumenti.", 'Hier erscheint die Ausgabe der Werkzeuge.'],
  ['A ponte com as ferramentas fechou. Confira se o Python está instalado.', 'The bridge to the tools closed. Check that Python is installed.', 'El puente con las herramientas se cerró. Comprueba que Python esté instalado.', "Le pont vers les outils s'est fermé. Vérifiez que Python est installé.", 'Il ponte con gli strumenti si è chiuso. Controlla che Python sia installato.', 'Die Verbindung zu den Werkzeugen wurde getrennt. Prüfe, ob Python installiert ist.'],
  ['Preparando a arte do jogo', 'Preparing the game art', 'Preparando el arte del juego', "Préparation des illustrations du jeu", "Preparazione della grafica del gioco", 'Spielgrafik wird vorbereitet'],
  // ------------------------------------------------------------ troféus
  ['Troféus', 'Trophies', 'Trofeos', 'Trophées', 'Trofei', 'Trophäen'],
  ['vitart Troféus', 'vitart Trophies', 'vitart Trofeos', 'vitart Trophées', 'vitart Trofei', 'vitart Trophäen'],
  ['Lendo os troféus', 'Reading trophies', 'Leyendo los trofeos', 'Lecture des trophées', 'Lettura dei trofei', 'Trophäen werden gelesen'],
  ['God of War Collection · Troféus', 'God of War Collection · Trophies', 'God of War Collection · Trofeos', 'God of War Collection · Trophées', 'God of War Collection · Trofei', 'God of War Collection · Trophäen'],
  ['Jogo', 'Game', 'Juego', 'Jeu', 'Gioco', 'Spiel'],
  ['Platina', 'Platinum', 'Platino', 'Platine', 'Platino', 'Platin'],
  ['Ouro', 'Gold', 'Oro', 'Or', 'Oro', 'Gold'],
  ['Prata', 'Silver', 'Plata', 'Argent', 'Argento', 'Silber'],
  ['Bronze', 'Bronze', 'Bronce', 'Bronze', 'Bronzo', 'Bronze'],
  ['Todos', 'All', 'Todos', 'Tous', 'Tutti', 'Alle'],
  ['Obtidos', 'Earned', 'Obtenidos', 'Obtenus', 'Ottenuti', 'Erhalten'],
  ['Faltando', 'Missing', 'Pendientes', 'Manquants', 'Mancanti', 'Fehlend'],
  ['Procurar troféu, golpe, chefe...', 'Search trophy, move, boss...', 'Buscar trofeo, golpe, jefe...', 'Chercher un trophée, un coup, un boss...', 'Cerca trofeo, mossa, boss...', 'Trophäe, Angriff, Boss suchen...'],
  ['Procurar troféu', 'Search trophy', 'Buscar trofeo', 'Chercher un trophée', 'Cerca trofeo', 'Trophäe suchen'],
  ['{a} de {b} troféus', '{a} of {b} trophies', '{a} de {b} trofeos', '{a} trophées sur {b}', '{a} di {b} trofei', '{a} von {b} Trophäen'],
  ['{a} troféu', '{a} trophy', '{a} trofeo', '{a} trophée', '{a} trofeo', '{a} Trophäe'],
  ['{a} troféus', '{a} trophies', '{a} trofeos', '{a} trophées', '{a} trofei', '{a} Trophäen'],
  ['Obtido', 'Earned', 'Obtenido', 'Obtenu', 'Ottenuto', 'Erhalten'],
  ['Bloqueado', 'Locked', 'Bloqueado', 'Verrouillé', 'Bloccato', 'Gesperrt'],
  ['NOVO', 'NEW', 'NUEVO', 'NOUVEAU', 'NUOVO', 'NEU'],
  ['Nenhum troféu aqui', 'No trophies here', 'Ningún trofeo aquí', 'Aucun trophée ici', 'Nessun trofeo qui', 'Keine Trophäen hier'],
  ['Nada bate com essa busca.', 'Nothing matches that search.', 'Nada coincide con esa búsqueda.', 'Rien ne correspond à cette recherche.', 'Nessun risultato per questa ricerca.', 'Nichts passt zu dieser Suche.'],
  ['Ainda nenhum troféu deste jogo.', 'No trophies from this game yet.', 'Aún ningún trofeo de este juego.', 'Encore aucun trophée pour ce jeu.', 'Ancora nessun trofeo di questo gioco.', 'Noch keine Trophäen aus diesem Spiel.'],
  ['Todos já foram pegos.', 'All of them are earned.', 'Ya los conseguiste todos.', 'Ils sont tous obtenus.', 'Li hai già ottenuti tutti.', 'Alle sind bereits erhalten.'],
  ['Platina conquistada', 'Platinum earned', 'Platino conseguido', 'Platine obtenu', 'Platino ottenuto', 'Platin erhalten'],
  ['Nada selecionado', 'Nothing selected', 'Nada seleccionado', 'Rien de sélectionné', 'Niente di selezionato', 'Nichts ausgewählt'],
  ['Todos os {a} troféus de {b}.', 'All {a} trophies of {b}.', 'Los {a} trofeos de {b}.', 'Les {a} trophées de {b}.', 'Tutti i {a} trofei di {b}.', 'Alle {a} Trophäen von {b}.'],
  ['Escolha um troféu na lista.', 'Pick a trophy from the list.', 'Elige un trofeo de la lista.', 'Choisissez un trophée dans la liste.', "Scegli un trofeo dall'elenco.", 'Wähle eine Trophäe aus der Liste.'],
  ['O que pede', 'What it asks', 'Qué pide', 'Ce qui est demandé', 'Cosa chiede', 'Was verlangt wird'],
  ['Como pegar', 'How to get it', 'Cómo conseguirlo', "Comment l'obtenir", 'Come ottenerlo', 'So bekommst du sie'],
  ['Ainda não obtido', 'Not earned yet', 'Aún no obtenido', 'Pas encore obtenu', 'Non ancora ottenuto', 'Noch nicht erhalten'],
  ['Troféu oculto', 'Hidden trophy', 'Trofeo oculto', 'Trophée caché', 'Trofeo nascosto', 'Versteckte Trophäe'],
  ['Troféu desbloqueado', 'Trophy unlocked', 'Trofeo desbloqueado', 'Trophée débloqué', 'Trofeo sbloccato', 'Trophäe freigeschaltet'],
  ['Não deu para ler os troféus', 'Could not read the trophies', 'No se pudieron leer los trofeos', 'Impossible de lire les trophées', 'Impossibile leggere i trofei', 'Die Trophäen konnten nicht gelesen werden'],
  // ------------------------------------------------------------ mod studio: navegação e cabeçalhos
  ['vitart Mod Studio', 'vitart Mod Studio', 'vitart Mod Studio', 'vitart Mod Studio', 'vitart Mod Studio', 'vitart Mod Studio'],
  ['Abrindo o Mod Studio', 'Opening Mod Studio', 'Abriendo Mod Studio', 'Ouverture de Mod Studio', 'Apertura di Mod Studio', 'Mod Studio wird geöffnet'],
  ['Seções', 'Sections', 'Secciones', 'Sections', 'Sezioni', 'Bereiche'],
  ['Ferramentas prontas', 'Tools ready', 'Herramientas listas', 'Outils prêts', 'Strumenti pronti', 'Werkzeuge bereit'],
  ['Trabalhando...', 'Working...', 'Trabajando...', 'En cours...', 'In corso...', 'Wird bearbeitet...'],
  ['Python fechou', 'Python closed', 'Python se cerró', 'Python fermé', 'Python chiuso', 'Python beendet'],
  ['Mods', 'Mods', 'Mods', 'Mods', 'Mod', 'Mods'],
  ['Instalados', 'Installed', 'Instalados', 'Installés', 'Installati', 'Installiert'],
  ['Seus mods', 'Your mods', 'Tus mods', 'Vos mods', 'I tuoi mod', 'Deine Mods'],
  ['Ligue, desligue e arraste para mudar a ordem. No jogo, Options > Mods > Apply aplica na hora.', 'Turn mods on or off and drag to reorder. In game, Options > Mods > Apply applies them right away.', 'Activa, desactiva y arrastra para cambiar el orden. En el juego, Options > Mods > Apply los aplica al instante.', "Activez, désactivez et faites glisser pour changer l'ordre. En jeu, Options > Mods > Apply les applique aussitôt.", "Attiva, disattiva e trascina per cambiare l'ordine. Nel gioco, Options > Mods > Apply li applica subito.", 'Ein- und ausschalten, zum Sortieren ziehen. Im Spiel wendet Options > Mods > Apply sie sofort an.'],
  ['Converter PS2', 'Convert PS2', 'Convertir PS2', 'Convertir PS2', 'Converti PS2', 'PS2 umwandeln'],
  ['Mods do PlayStation 2', 'PlayStation 2 mods', 'Mods de PlayStation 2', 'Mods PlayStation 2', 'Mod per PlayStation 2', 'PlayStation-2-Mods'],
  ['Converter mod do PS2', 'Convert a PS2 mod', 'Convertir mod de PS2', 'Convertir un mod PS2', 'Converti un mod PS2', 'PS2-Mod umwandeln'],
  ['Um patch XDelta do GoW2 de PS2 (solto ou dentro do .zip) mais a ISO original viram um mod do vitart.', 'An XDelta patch for PS2 GoW2 (loose or inside the .zip) plus the original ISO become a vitart mod.', 'Un parche XDelta del GoW2 de PS2 (suelto o dentro del .zip) más la ISO original se convierten en un mod de vitart.', "Un patch XDelta du GoW2 PS2 (seul ou dans le .zip) et l'ISO d'origine deviennent un mod vitart.", "Una patch XDelta del GoW2 per PS2 (sciolta o nello .zip) più la ISO originale diventano un mod di vitart.", 'Ein XDelta-Patch für das PS2-GoW2 (einzeln oder im .zip) plus die Original-ISO werden zu einem vitart-Mod.'],
  ['Texturas', 'Textures', 'Texturas', 'Textures', 'Texture', 'Texturen'],
  ['Editor', 'Editor', 'Editor', 'Éditeur', 'Editor', 'Editor'],
  ['Texturas do jogo', 'Game textures', 'Texturas del juego', 'Textures du jeu', 'Texture del gioco', 'Spieltexturen'],
  ['Veja as texturas de cada WAD, exporte em PNG, troque pelas suas e salve tudo como um mod.', 'Browse the textures of each WAD, export them as PNG, swap in your own and save it all as a mod.', 'Mira las texturas de cada WAD, expórtalas en PNG, cámbialas por las tuyas y guárdalo todo como un mod.', "Parcourez les textures de chaque WAD, exportez-les en PNG, remplacez-les par les vôtres et enregistrez le tout en mod.", 'Guarda le texture di ogni WAD, esportale in PNG, sostituiscile con le tue e salva tutto come mod.', 'Sieh dir die Texturen jedes WAD an, exportiere sie als PNG, ersetze sie durch eigene und speichere alles als Mod.'],
  ['Textos', 'Texts', 'Textos', 'Textes', 'Testi', 'Texte'],
  ['Tradução', 'Translation', 'Traducción', 'Traduction', 'Traduzione', 'Übersetzung'],
  ['Textos e tradução', 'Texts and translation', 'Textos y traducción', 'Textes et traduction', 'Testi e traduzione', 'Texte und Übersetzung'],
  ['Exporte os textos do jogo, traduza o .txt e instale como mod.', 'Export the game texts, translate the .txt and install it as a mod.', 'Exporta los textos del juego, traduce el .txt e instálalo como mod.', 'Exportez les textes du jeu, traduisez le .txt et installez-le comme mod.', 'Esporta i testi del gioco, traduci il .txt e installalo come mod.', 'Exportiere die Spieltexte, übersetze die .txt und installiere sie als Mod.'],
  ['Configurações', 'Settings', 'Ajustes', 'Paramètres', 'Impostazioni', 'Einstellungen'],
  ['Pastas e programas', 'Folders and programs', 'Carpetas y programas', 'Dossiers et programmes', 'Cartelle e programmi', 'Ordner und Programme'],
  ['Onde ficam o jogo, o vitart-data e as ferramentas que a conversão usa.', 'Where the game, vitart-data and the conversion tools live.', 'Dónde están el juego, vitart-data y las herramientas de conversión.', 'Où se trouvent le jeu, vitart-data et les outils de conversion.', 'Dove si trovano il gioco, vitart-data e gli strumenti di conversione.', 'Wo das Spiel, vitart-data und die Umwandlungswerkzeuge liegen.'],
  ['Guia', 'Guide', 'Guía', 'Guide', 'Guida', 'Anleitung'],
  ['Documentação', 'Documentation', 'Documentación', 'Documentation', 'Documentazione', 'Dokumentation'],
  ['Guia de modding', 'Modding guide', 'Guía de modding', 'Guide du modding', 'Guida al modding', 'Modding-Anleitung'],
  ['Formatos, estrutura de um mod e como o vitart carrega tudo.', 'Formats, how a mod is laid out and how vitart loads it all.', 'Formatos, estructura de un mod y cómo vitart lo carga todo.', "Formats, structure d'un mod et façon dont vitart charge tout.", 'Formati, struttura di un mod e come vitart carica tutto.', 'Formate, Aufbau eines Mods und wie vitart alles lädt.'],
  ['O guia está disponível só em português.', 'The guide is only available in Portuguese.', 'La guía solo está disponible en portugués.', "Le guide n'existe qu'en portugais.", 'La guida è disponibile solo in portoghese.', 'Die Anleitung gibt es nur auf Portugiesisch.'],
  ['Guia não encontrado: {a}', 'Guide not found: {a}', 'Guía no encontrada: {a}', 'Guide introuvable : {a}', 'Guida non trovata: {a}', 'Anleitung nicht gefunden: {a}'],
  // ------------------------------------------------------------ mods
  ['Espere', 'Wait', 'Espera', 'Patientez', 'Attendi', 'Warte'],
  ['Ainda tem uma operação rodando.', 'Another operation is still running.', 'Todavía hay una operación en curso.', 'Une opération est encore en cours.', "C'è ancora un'operazione in corso.", 'Ein anderer Vorgang läuft noch.'],
  ['Espere a operação atual terminar.', 'Wait for the current operation to finish.', 'Espera a que termine la operación actual.', "Attendez la fin de l'opération en cours.", "Attendi che finisca l'operazione in corso.", 'Warte, bis der aktuelle Vorgang fertig ist.'],
  ['Não deu', 'That did not work', 'No funcionó', 'Échec', 'Non è riuscito', 'Hat nicht geklappt'],
  ['Pasta dos mods', 'Mods folder', 'Carpeta de mods', 'Dossier des mods', 'Cartella dei mod', 'Mod-Ordner'],
  ['Reconstruir menu e patches', 'Rebuild menu and patches', 'Reconstruir menú y parches', 'Reconstruire le menu et les patchs', 'Ricostruisci menu e patch', 'Menü und Patches neu erstellen'],
  ['Registro', 'Log', 'Registro', 'Journal', 'Registro', 'Protokoll'],
  ['{a} instalados · {b} ligados', '{a} installed · {b} on', '{a} instalados · {b} activos', '{a} installés · {b} actifs', '{a} installati · {b} attivi', '{a} installiert · {b} aktiv'],
  ['Nenhum mod instalado', 'No mods installed', 'Ningún mod instalado', 'Aucun mod installé', 'Nessun mod installato', 'Keine Mods installiert'],
  ['Converta um mod do PS2, troque texturas ou instale uma tradução.', 'Convert a PS2 mod, swap textures or install a translation.', 'Convierte un mod de PS2, cambia texturas o instala una traducción.', 'Convertissez un mod PS2, remplacez des textures ou installez une traduction.', 'Converti un mod PS2, sostituisci texture o installa una traduzione.', 'Wandle einen PS2-Mod um, ersetze Texturen oder installiere eine Übersetzung.'],
  ['Desligar', 'Turn off', 'Desactivar', 'Désactiver', 'Disattiva', 'Ausschalten'],
  ['Ligar', 'Turn on', 'Activar', 'Activer', 'Attiva', 'Einschalten'],
  ['Ligar {a}', 'Turn on {a}', 'Activar {a}', 'Activer {a}', 'Attiva {a}', '{a} einschalten'],
  ['Arraste para mudar a ordem', 'Drag to reorder', 'Arrastra para cambiar el orden', "Faites glisser pour changer l'ordre", "Trascina per cambiare l'ordine", 'Zum Sortieren ziehen'],
  ['autor desconhecido', 'unknown author', 'autor desconocido', 'auteur inconnu', 'autore sconosciuto', 'unbekannter Autor'],
  ['{a} arquivos', '{a} files', '{a} archivos', '{a} fichiers', '{a} file', '{a} Dateien'],
  ['Ordem mudada', 'Order changed', 'Orden cambiado', 'Ordre modifié', 'Ordine cambiato', 'Reihenfolge geändert'],
  ['Reconstrua para o menu do jogo mostrar a ordem nova.', 'Rebuild so the game menu shows the new order.', 'Reconstruye para que el menú del juego muestre el nuevo orden.', 'Reconstruisez pour que le menu du jeu affiche le nouvel ordre.', 'Ricostruisci perché il menu del gioco mostri il nuovo ordine.', 'Neu erstellen, damit das Spielmenü die neue Reihenfolge zeigt.'],
  ['Sem descrição.', 'No description.', 'Sin descripción.', 'Pas de description.', 'Nessuna descrizione.', 'Keine Beschreibung.'],
  ['Estado', 'Status', 'Estado', 'État', 'Stato', 'Status'],
  ['Ligado', 'On', 'Activado', 'Activé', 'Attivo', 'An'],
  ['Desligado', 'Off', 'Desactivado', 'Désactivé', 'Disattivo', 'Aus'],
  ['Autor', 'Author', 'Autor', 'Auteur', 'Autore', 'Autor'],
  ['Versão', 'Version', 'Versión', 'Version', 'Versione', 'Version'],
  ['Tamanho', 'Size', 'Tamaño', 'Taille', 'Dimensione', 'Größe'],
  ['{a} em {b} arquivos', '{a} in {b} files', '{a} en {b} archivos', '{a} en {b} fichiers', '{a} in {b} file', '{a} in {b} Dateien'],
  ['Arquivos que troca', 'Files it replaces', 'Archivos que cambia', 'Fichiers remplacés', 'File che sostituisce', 'Ersetzte Dateien'],
  ['Abrir pasta', 'Open folder', 'Abrir carpeta', 'Ouvrir le dossier', 'Apri cartella', 'Ordner öffnen'],
  ['Remover', 'Remove', 'Quitar', 'Retirer', 'Rimuovi', 'Entfernen'],
  ['Remover mod', 'Remove mod', 'Quitar mod', 'Retirer le mod', 'Rimuovi mod', 'Mod entfernen'],
  ['"{a}" vai para vitart-data/mods_removidos. Nada é apagado.', '"{a}" goes to vitart-data/mods_removidos. Nothing is deleted.', '"{a}" va a vitart-data/mods_removidos. No se borra nada.', '"{a}" va dans vitart-data/mods_removidos. Rien n\'est supprimé.', '"{a}" va in vitart-data/mods_removidos. Non si cancella niente.', '"{a}" wandert nach vitart-data/mods_removidos. Nichts wird gelöscht.'],
  ['Pronto', 'Done', 'Listo', 'Terminé', 'Fatto', 'Fertig'],
  ['Falhou', 'Failed', 'Falló', 'Échec', 'Non riuscito', 'Fehlgeschlagen'],
  ['Menu e patches reconstruídos.', 'Menu and patches rebuilt.', 'Menú y parches reconstruidos.', 'Menu et patchs reconstruits.', 'Menu e patch ricostruiti.', 'Menü und Patches neu erstellt.'],
  ['Veja o registro.', 'See the log.', 'Mira el registro.', 'Voir le journal.', 'Guarda il registro.', 'Siehe Protokoll.'],
  ['mod não encontrado: {a}', 'mod not found: {a}', 'mod no encontrado: {a}', 'mod introuvable : {a}', 'mod non trovato: {a}', 'Mod nicht gefunden: {a}'],
  // ------------------------------------------------------------ converter
  ['Escolher', 'Choose', 'Elegir', 'Choisir', 'Scegli', 'Auswählen'],
  ['Patch', 'Patch', 'Parche', 'Patch', 'Patch', 'Patch'],
  ['aplica o xdelta em fluxo', 'applies the xdelta as a stream', 'aplica el xdelta en flujo', 'applique le xdelta en flux', "applica l'xdelta in streaming", 'wendet das xdelta im Datenstrom an'],
  ['Conversão', 'Conversion', 'Conversión', 'Conversion', 'Conversione', 'Umwandlung'],
  ['WADs do PS2 para o Vita', 'PS2 WADs to Vita', 'WAD de PS2 a Vita', 'WAD PS2 vers Vita', 'WAD da PS2 a Vita', 'PS2-WADs zu Vita'],
  ['Instalação', 'Installation', 'Instalación', 'Installation', 'Installazione', 'Installation'],
  ['vira um mod do vitart', 'becomes a vitart mod', 'se vuelve un mod de vitart', 'devient un mod vitart', 'diventa un mod di vitart', 'wird zum vitart-Mod'],
  ['Menu', 'Menu', 'Menú', 'Menu', 'Menu', 'Menü'],
  ['patches e página Mods', 'patches and Mods page', 'parches y página Mods', 'patchs et page Mods', 'patch e pagina Mods', 'Patches und Mods-Seite'],
  ['Patch do mod', 'Mod patch', 'Parche del mod', 'Patch du mod', 'Patch del mod', 'Mod-Patch'],
  ['.xdelta solto ou o .zip do mod com ele dentro.', 'A loose .xdelta or the mod .zip that contains it.', '.xdelta suelto o el .zip del mod que lo contiene.', '.xdelta seul ou le .zip du mod qui le contient.', ".xdelta sciolto o lo .zip del mod che lo contiene.", 'Einzelnes .xdelta oder das Mod-.zip, das es enthält.'],
  ['ISO original do PS2', 'Original PS2 ISO', 'ISO original de PS2', "ISO PS2 d'origine", 'ISO originale PS2', 'Original-PS2-ISO'],
  ['A mesma região e versão que o mod pede (.iso ou .7z).', 'The same region and version the mod asks for (.iso or .7z).', 'La misma región y versión que pide el mod (.iso o .7z).', 'La même région et version que demande le mod (.iso ou .7z).', 'La stessa regione e versione richiesta dal mod (.iso o .7z).', 'Dieselbe Region und Version, die der Mod verlangt (.iso oder .7z).'],
  ['Nome no menu', 'Name in the menu', 'Nombre en el menú', 'Nom dans le menu', 'Nome nel menu', 'Name im Menü'],
  ['Até 24 letras: é o que aparece em Options > Mods.', 'Up to 24 letters: this is what shows in Options > Mods.', 'Hasta 24 letras: es lo que aparece en Options > Mods.', "Jusqu'à 24 lettres : c'est ce qui s'affiche dans Options > Mods.", 'Fino a 24 lettere: è ciò che appare in Options > Mods.', 'Bis zu 24 Zeichen: das steht unter Options > Mods.'],
  ['Id (pasta)', 'Id (folder)', 'Id (carpeta)', 'Id (dossier)', 'Id (cartella)', 'Id (Ordner)'],
  ['Autor(es)', 'Author(s)', 'Autor(es)', 'Auteur(s)', 'Autore/i', 'Autor(en)'],
  ['Dê o crédito de quem fez o mod.', 'Credit whoever made the mod.', 'Da crédito a quien hizo el mod.', 'Créditez la personne qui a fait le mod.', 'Dai credito a chi ha fatto il mod.', 'Nenne, wer den Mod gemacht hat.'],
  ['GoW1 ainda não tem conversor de malha do PS2.', 'GoW1 has no PS2 mesh converter yet.', 'GoW1 aún no tiene conversor de mallas de PS2.', "GoW1 n'a pas encore de convertisseur de maillage PS2.", 'GoW1 non ha ancora un convertitore di mesh PS2.', 'Für GoW1 gibt es noch keinen PS2-Mesh-Konverter.'],
  ['Descrição', 'Description', 'Descripción', 'Description', 'Descrizione', 'Beschreibung'],
  ['Converter e instalar', 'Convert and install', 'Convertir e instalar', 'Convertir et installer', 'Converti e installa', 'Umwandeln und installieren'],
  ['Manter a pasta de trabalho', 'Keep the work folder', 'Conservar la carpeta de trabajo', 'Garder le dossier de travail', 'Conserva la cartella di lavoro', 'Arbeitsordner behalten'],
  ['Faltam dados', 'Missing information', 'Faltan datos', 'Informations manquantes', 'Mancano dati', 'Angaben fehlen'],
  ['Escolha o patch, a ISO e dê um nome ao mod.', 'Pick the patch and the ISO and name the mod.', 'Elige el parche y la ISO y ponle nombre al mod.', "Choisissez le patch et l'ISO et nommez le mod.", 'Scegli la patch e la ISO e dai un nome al mod.', 'Wähle Patch und ISO und gib dem Mod einen Namen.'],
  ['Mod instalado', 'Mod installed', 'Mod instalado', 'Mod installé', 'Mod installato', 'Mod installiert'],
  ['A conversão falhou', 'The conversion failed', 'La conversión falló', 'La conversion a échoué', 'La conversione non è riuscita', 'Die Umwandlung ist fehlgeschlagen'],
  ['"{a}" está na aba Mods. Ligue lá ou em Options > Mods.', '"{a}" is in the Mods tab. Turn it on there or in Options > Mods.', '"{a}" está en la pestaña Mods. Actívalo ahí o en Options > Mods.', '"{a}" est dans l\'onglet Mods. Activez-le là ou dans Options > Mods.', '"{a}" è nella scheda Mods. Attivalo lì o in Options > Mods.', '"{a}" ist im Reiter Mods. Schalte ihn dort oder unter Options > Mods ein.'],
  // ------------------------------------------------------------ texturas
  ['Filtrar WADs (ex.: r_hero, pal)', 'Filter WADs (e.g. r_hero, pal)', 'Filtrar WAD (p. ej. r_hero, pal)', 'Filtrer les WAD (ex. : r_hero, pal)', 'Filtra WAD (es. r_hero, pal)', 'WADs filtern (z. B. r_hero, pal)'],
  ['Exportar todas do WAD', 'Export all from WAD', 'Exportar todas del WAD', 'Tout exporter du WAD', 'Esporta tutte dal WAD', 'Alle aus dem WAD exportieren'],
  ['Escolha um WAD à esquerda.', 'Pick a WAD on the left.', 'Elige un WAD a la izquierda.', 'Choisissez un WAD à gauche.', 'Scegli un WAD a sinistra.', 'Wähle links ein WAD.'],
  ['Lendo o WAD...', 'Reading the WAD...', 'Leyendo el WAD...', 'Lecture du WAD...', 'Lettura del WAD...', 'WAD wird gelesen...'],
  ['{a} · {b} texturas', '{a} · {b} textures', '{a} · {b} texturas', '{a} · {b} textures', '{a} · {b} texture', '{a} · {b} Texturen'],
  ['Este WAD não tem texturas.', 'This WAD has no textures.', 'Este WAD no tiene texturas.', "Ce WAD n'a pas de textures.", 'Questo WAD non ha texture.', 'Dieses WAD hat keine Texturen.'],
  ['Nenhuma textura selecionada.', 'No texture selected.', 'Ninguna textura seleccionada.', 'Aucune texture sélectionnée.', 'Nessuna texture selezionata.', 'Keine Textur ausgewählt.'],
  ['trocada por {a}', 'replaced by {a}', 'cambiada por {a}', 'remplacée par {a}', 'sostituita da {a}', 'ersetzt durch {a}'],
  ['TROCADA', 'REPLACED', 'CAMBIADA', 'REMPLACÉE', 'SOSTITUITA', 'ERSETZT'],
  ['Exportar', 'Export', 'Exportar', 'Exporter', 'Esporta', 'Exportieren'],
  ['Trocar', 'Replace', 'Cambiar', 'Remplacer', 'Sostituisci', 'Ersetzen'],
  ['Desfazer', 'Undo', 'Deshacer', 'Annuler', 'Annulla', 'Rückgängig'],
  ['Trocas pendentes: {a}', 'Pending replacements: {a}', 'Cambios pendientes: {a}', 'Remplacements en attente : {a}', 'Sostituzioni in sospeso: {a}', 'Offene Ersetzungen: {a}'],
  ['Nome do mod', 'Mod name', 'Nombre del mod', 'Nom du mod', 'Nome del mod', 'Mod-Name'],
  ['Criar mod com as trocas', 'Create mod from replacements', 'Crear mod con los cambios', 'Créer un mod avec les remplacements', 'Crea mod con le sostituzioni', 'Mod aus den Ersetzungen erstellen'],
  ['Exportada', 'Exported', 'Exportada', 'Exportée', 'Esportata', 'Exportiert'],
  ['Exportadas', 'Exported', 'Exportadas', 'Exportées', 'Esportate', 'Exportiert'],
  ['{a} texturas em {b}', '{a} textures in {b}', '{a} texturas en {b}', '{a} textures dans {b}', '{a} texture in {b}', '{a} Texturen in {b}'],
  ['Imagens', 'Images', 'Imágenes', 'Images', 'Immagini', 'Bilder'],
  ['Falta o nome', 'Name missing', 'Falta el nombre', 'Nom manquant', 'Manca il nome', 'Name fehlt'],
  ['Dê um nome ao mod.', 'Give the mod a name.', 'Ponle un nombre al mod.', 'Donnez un nom au mod.', 'Dai un nome al mod.', 'Gib dem Mod einen Namen.'],
  ['Mod criado', 'Mod created', 'Mod creado', 'Mod créé', 'Mod creato', 'Mod erstellt'],
  ['"{a}" instalado. Ligue na aba Mods.', '"{a}" installed. Turn it on in the Mods tab.', '"{a}" instalado. Actívalo en la pestaña Mods.', '"{a}" installé. Activez-le dans l\'onglet Mods.', '"{a}" installato. Attivalo nella scheda Mods.', '"{a}" installiert. Schalte ihn im Reiter Mods ein.'],
  ['Nenhuma textura trocada neste jogo.', 'No textures replaced for this game.', 'Ninguna textura cambiada en este juego.', 'Aucune texture remplacée pour ce jeu.', 'Nessuna texture sostituita in questo gioco.', 'Für dieses Spiel wurden keine Texturen ersetzt.'],
  // ------------------------------------------------------------ textos
  ['Exporte os textos (MSGS_TXT, os do modo PS TV que o vitart mostra), traduza o .txt mantendo as linhas', 'Export the texts (MSGS_TXT, the PS TV ones vitart shows), translate the .txt keeping the lines', 'Exporta los textos (MSGS_TXT, los del modo PS TV que muestra vitart), traduce el .txt manteniendo las líneas', 'Exportez les textes (MSGS_TXT, ceux du mode PS TV affichés par vitart), traduisez le .txt en gardant les lignes', 'Esporta i testi (MSGS_TXT, quelli della modalità PS TV mostrati da vitart), traduci il .txt mantenendo le righe', 'Exportiere die Texte (MSGS_TXT, die PS-TV-Texte, die vitart zeigt), übersetze die .txt und behalte die Zeilen'],
  ['e as marcas como', 'and markers like', 'y las marcas como', 'et les balises comme', 'e i segnaposto come', 'und Marken wie'],
  [', e instale. A fonte do jogo não tem maiúsculas acentuadas nem ã/õ: o kit troca por A, E, U e ä/ö. Vale ao abrir o jogo.', ', then install. The game font has no accented capitals and no ã/õ: the kit swaps them for A, E, U and ä/ö. Applies when the game starts.', ', e instálalo. La fuente del juego no tiene mayúsculas acentuadas ni ã/õ: el kit las cambia por A, E, U y ä/ö. Se aplica al abrir el juego.', ", puis installez. La police du jeu n'a pas de majuscules accentuées ni ã/õ : le kit les remplace par A, E, U et ä/ö. Pris en compte au lancement du jeu.", ", poi installa. Il font del gioco non ha maiuscole accentate né ã/õ: il kit le sostituisce con A, E, U e ä/ö. Vale all'avvio del gioco.", ', dann installieren. Die Spielschrift hat keine Großbuchstaben mit Akzent und kein ã/õ: das Kit ersetzt sie durch A, E, U und ä/ö. Gilt beim Spielstart.'],
  ['Exportar os textos originais', 'Export the original texts', 'Exportar los textos originales', 'Exporter les textes originaux', 'Esporta i testi originali', 'Originaltexte exportieren'],
  ['Arquivo .txt traduzido', 'Translated .txt file', 'Archivo .txt traducido', 'Fichier .txt traduit', 'File .txt tradotto', 'Übersetzte .txt-Datei'],
  ['Texto', 'Text', 'Texto', 'Texte', 'Testo', 'Text'],
  ['Instalar tradução', 'Install translation', 'Instalar traducción', 'Installer la traduction', 'Installa traduzione', 'Übersetzung installieren'],
  ['Exportado', 'Exported', 'Exportado', 'Exporté', 'Esportato', 'Exportiert'],
  ['Escolha o .txt traduzido e dê um nome ao mod.', 'Pick the translated .txt and name the mod.', 'Elige el .txt traducido y ponle nombre al mod.', 'Choisissez le .txt traduit et nommez le mod.', 'Scegli il .txt tradotto e dai un nome al mod.', 'Wähle die übersetzte .txt und gib dem Mod einen Namen.'],
  ['Tradução instalada', 'Translation installed', 'Traducción instalada', 'Traduction installée', 'Traduzione installata', 'Übersetzung installiert'],
  ['Ligue na aba Mods e abra o jogo de novo.', 'Turn it on in the Mods tab and restart the game.', 'Actívala en la pestaña Mods y vuelve a abrir el juego.', "Activez-la dans l'onglet Mods et relancez le jeu.", 'Attivala nella scheda Mods e riapri il gioco.', 'Schalte sie im Reiter Mods ein und starte das Spiel neu.'],
  // ------------------------------------------------------------ configurações
  ['Pasta do jogo', 'Game folder', 'Carpeta del juego', 'Dossier du jeu', 'Cartella del gioco', 'Spielordner'],
  ['PCSA00126, com exec/*.psarc', 'PCSA00126, with exec/*.psarc', 'PCSA00126, con exec/*.psarc', 'PCSA00126, avec exec/*.psarc', 'PCSA00126, con exec/*.psarc', 'PCSA00126, mit exec/*.psarc'],
  ['Pasta vitart-data', 'vitart-data folder', 'Carpeta vitart-data', 'Dossier vitart-data', 'Cartella vitart-data', 'vitart-data-Ordner'],
  ['Pasta de trabalho', 'Work folder', 'Carpeta de trabajo', 'Dossier de travail', 'Cartella di lavoro', 'Arbeitsordner'],
  ['temporários da conversão', 'conversion temp files', 'temporales de la conversión', 'fichiers temporaires de conversion', 'file temporanei della conversione', 'Temporärdateien der Umwandlung'],
  ['para ISO dentro de .7z', 'for an ISO inside a .7z', 'para ISO dentro de .7z', 'pour une ISO dans un .7z', 'per ISO dentro un .7z', 'für eine ISO in einer .7z'],
  ['Salvar', 'Save', 'Guardar', 'Enregistrer', 'Salva', 'Speichern'],
  ['Salvo', 'Saved', 'Guardado', 'Enregistré', 'Salvato', 'Gespeichert'],
];

const _exato = new Map(), _moldes = [];
{
  const col = Object.keys(IDIOMAS).indexOf(IDIOMA);
  for (const f of FRASES) {
    if (col <= 0 || !f[col]) continue;
    if (/\{\w\}/.test(f[0])) {
      const nomes = [...f[0].matchAll(/\{(\w)\}/g)].map(m => m[1]);
      const re = new RegExp('^' + f[0].replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{(\w)\\?\}/g, '(.+?)') + '$');
      _moldes.push({ re, nomes, alvo: f[col] });
    } else _exato.set(f[0], f[col]);
  }
  // o molde mais específico primeiro ("{a} em {b} arquivos" antes de "{a} arquivos")
  const fixo = m => m.re.source.replace(/\(\.\+\?\)/g, '').length;
  _moldes.sort((x, y) => fixo(y) - fixo(x));
}
// tr(texto em português) -> no idioma atual (o que não está no dicionário volta igual)
function tr(s, v) {
  if (v) return tr(s).replace(/\{(\w)\}/g, (_, n) => v[n] ?? '');
  if (IDIOMA === 'pt' || !s) return s;
  const k = s.trim();
  if (!k) return s;
  let r = _exato.get(k);
  if (r === undefined) {
    for (const m of _moldes) {
      const g = k.match(m.re);
      if (g) { r = m.alvo.replace(/\{(\w)\}/g, (_, n) => g[m.nomes.indexOf(n) + 1] ?? ''); break; }
    }
  }
  if (r === undefined) return s;
  return s.replace(k, r); // preserva os espaços em volta
}

// traduz um pedaço do DOM e tudo que entrar depois
const _ATRIBUTOS = ['placeholder', 'title', 'aria-label', 'data-vazio'];
function _traduzir(no) {
  if (IDIOMA === 'pt') return;
  if (no.nodeType === 3) {
    const p = no.parentElement;
    if (!p || p.closest('[data-no-i18n], script, style, code, pre')) return;
    const n = tr(no.data);
    if (n !== no.data) no.data = n;
    return;
  }
  if (no.nodeType !== 1 || no.closest('[data-no-i18n]')) return;
  for (const a of _ATRIBUTOS) if (no.hasAttribute(a)) { const v = no.getAttribute(a), n = tr(v); if (n !== v) no.setAttribute(a, n); }
  for (const c of no.childNodes) _traduzir(c);
}
if (IDIOMA !== 'pt') {
  document.addEventListener('DOMContentLoaded', () => {
    document.title = tr(document.title);
    _traduzir(document.body);
    new MutationObserver(lista => {
      for (const m of lista) {
        if (m.type === 'characterData') _traduzir(m.target);
        else if (m.type === 'attributes') _traduzir(m.target);
        else m.addedNodes.forEach(_traduzir);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: _ATRIBUTOS });
  });
}
document.documentElement.lang = IDIOMA === 'pt' ? 'pt-BR' : IDIOMA;

// seletor na barra de título: troca e recarrega a página
function seletorIdioma() {
  const s = document.createElement('select');
  s.className = 'idioma';
  s.setAttribute('aria-label', 'Idioma');
  s.setAttribute('data-no-i18n', '');
  for (const [k, nome] of Object.entries(IDIOMAS)) {
    const o = document.createElement('option');
    o.value = k; o.textContent = nome; o.selected = k === IDIOMA;
    s.append(o);
  }
  s.addEventListener('change', () => { try { localStorage.setItem('idioma', s.value); } catch (_) { /* sem armazenamento */ } location.reload(); });
  return s;
}
