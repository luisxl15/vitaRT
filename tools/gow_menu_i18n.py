"""Textos do menu de opções do vitart (tools/gow_menu_mod.py) em cada idioma do Settings > Idioma do jogo.

O patch do menu é refeito quando o idioma muda (tools/vitart_modkit.py rebuild, com --lang). As letras passam pelo
que a fonte do jogo tem: no GoW1 os textos do FLP são latin-1 e as minúsculas acentuadas existem (as maiúsculas
acentuadas são ícones de botão: viram a letra sem acento); no GoW2 são UTF-8 e ficam sem acento.
"""
import unicodedata

TEXTOS = {
    'pt-BR': {
        'HD Textures': 'Texturas HD', 'PS2 Audio': 'Áudio do PS2', 'Resolution': 'Resolução',
        'Frame Rate': 'Quadros/s', 'Aspect Ratio': 'Proporção', 'VSync': 'VSync', 'FPS Counter': 'Contador de FPS',
        'Display Mode': 'Modo de Tela', 'Auto QTE': 'QTE Automático', 'Enemy Health': 'Vida dos Inimigos',
        'Infinite Health': 'Vida Infinita', 'Infinite Magic': 'Magia Infinita', 'Infinite Rage': 'Fúria Infinita',
        'Unlock Trophies': 'Liberar Troféus', 'Graphics': 'Gráficos', 'Audio & Gameplay': 'Áudio e Jogo',
        'Cheats': 'Trapaças', 'Back': 'Voltar', 'Mods': 'Mods', 'Apply': 'Aplicar',
        'Off': 'Não', 'On': 'Sim', 'Windowed': 'Janela', 'Borderless': 'Sem Bordas', 'Press X': 'Aperte X',
        'Done': 'Feito', 'Unavailable': 'Indisp.', 'Max FPS': 'FPS Máximo', 'Auto': 'Auto',
        'Quit to Desktop': 'Fechar o Jogo', 'Confirm': 'X de Novo', 'Exiting...': 'Saindo...',
    },
    'es': {
        'HD Textures': 'Texturas HD', 'PS2 Audio': 'Audio de PS2', 'Resolution': 'Resolución',
        'Frame Rate': 'Fotogramas', 'Aspect Ratio': 'Proporción', 'VSync': 'VSync', 'FPS Counter': 'Contador de FPS',
        'Display Mode': 'Pantalla', 'Auto QTE': 'QTE Automático', 'Enemy Health': 'Salud Enemiga',
        'Infinite Health': 'Salud Infinita', 'Infinite Magic': 'Magia Infinita', 'Infinite Rage': 'Furia Infinita',
        'Unlock Trophies': 'Desbloq. Trofeos', 'Graphics': 'Gráficos', 'Audio & Gameplay': 'Audio y Juego',
        'Cheats': 'Trucos', 'Back': 'Volver', 'Mods': 'Mods', 'Apply': 'Aplicar',
        'Off': 'No', 'On': 'Sí', 'Windowed': 'Ventana', 'Borderless': 'Sin Bordes', 'Press X': 'Pulsa X',
        'Done': 'Hecho', 'Unavailable': 'No Disp.', 'Max FPS': 'FPS Máx.', 'Auto': 'Auto',
        'Quit to Desktop': 'Cerrar el Juego', 'Confirm': 'X Otra Vez', 'Exiting...': 'Saliendo...',
    },
    'fr': {
        'HD Textures': 'Textures HD', 'PS2 Audio': 'Audio PS2', 'Resolution': 'Résolution',
        'Frame Rate': 'Images/s', 'Aspect Ratio': 'Format', 'VSync': 'VSync', 'FPS Counter': 'Compteur FPS',
        'Display Mode': 'Affichage', 'Auto QTE': 'QTE Auto', 'Enemy Health': 'Santé Ennemie',
        'Infinite Health': 'Santé Infinie', 'Infinite Magic': 'Magie Infinie', 'Infinite Rage': 'Rage Infinie',
        'Unlock Trophies': 'Débloq. Trophées', 'Graphics': 'Graphismes', 'Audio & Gameplay': 'Audio et Jeu',
        'Cheats': 'Triches', 'Back': 'Retour', 'Mods': 'Mods', 'Apply': 'Appliquer',
        'Off': 'Non', 'On': 'Oui', 'Windowed': 'Fenêtré', 'Borderless': 'Sans Bordure',
        'Press X': 'Valider', 'Done': 'Fait', 'Unavailable': 'Indispo.', 'Max FPS': 'FPS Max',
        'Quit to Desktop': 'Fermer le Jeu', 'Confirm': 'Confirmer', 'Exiting...': 'Fermeture...',
        'Auto': 'Auto',
    },
    'it': {
        'HD Textures': 'Texture HD', 'PS2 Audio': 'Audio PS2', 'Resolution': 'Risoluzione',
        'Frame Rate': 'Fotogrammi', 'Aspect Ratio': 'Proporzioni', 'VSync': 'VSync', 'FPS Counter': 'Contatore FPS',
        'Display Mode': 'Schermo', 'Auto QTE': 'QTE Automatici', 'Enemy Health': 'Salute Nemici',
        'Infinite Health': 'Salute Infinita', 'Infinite Magic': 'Magia Infinita', 'Infinite Rage': 'Furia Infinita',
        'Unlock Trophies': 'Sblocca Trofei', 'Graphics': 'Grafica', 'Audio & Gameplay': 'Audio e Gioco',
        'Cheats': 'Trucchi', 'Back': 'Indietro', 'Mods': 'Mod', 'Apply': 'Applica',
        'Off': 'No', 'On': 'Sì', 'Windowed': 'Finestra', 'Borderless': 'Senza Bordi', 'Press X': 'Premi X',
        'Done': 'Fatto', 'Unavailable': 'Non Disp.', 'Max FPS': 'FPS Max', 'Auto': 'Auto',
        'Quit to Desktop': 'Chiudi il Gioco', 'Confirm': 'X Ancora', 'Exiting...': 'Chiusura...',
    },
    'de': {
        'HD Textures': 'HD-Texturen', 'PS2 Audio': 'PS2-Audio', 'Resolution': 'Auflösung',
        'Frame Rate': 'Bildrate', 'Aspect Ratio': 'Seitenverhältnis', 'VSync': 'VSync', 'FPS Counter': 'FPS-Anzeige',
        'Display Mode': 'Anzeigemodus', 'Auto QTE': 'Auto-QTE', 'Enemy Health': 'Gegnerleben',
        'Infinite Health': 'Unendlich Leben', 'Infinite Magic': 'Unendlich Magie', 'Infinite Rage': 'Unendlich Wut',
        'Unlock Trophies': 'Alle Trophäen', 'Graphics': 'Grafik', 'Audio & Gameplay': 'Audio & Spiel',
        'Cheats': 'Cheats', 'Back': 'Zurück', 'Mods': 'Mods', 'Apply': 'Anwenden',
        'Off': 'Aus', 'On': 'An', 'Windowed': 'Fenster', 'Borderless': 'Randlos', 'Press X': 'X Drücken',
        'Done': 'Fertig', 'Unavailable': 'N. Verfügbar', 'Max FPS': 'Max. FPS', 'Auto': 'Auto',
        'Quit to Desktop': 'Spiel Beenden', 'Confirm': 'Nochmal X', 'Exiting...': 'Beendet...',
    },
}


def _sem_acento(s):
    return unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()


def para_fonte(s, game, lang):
    """O texto nas letras que a fonte do jogo mostra (ver o cabeçalho)."""
    if game != 'gow1':
        return _sem_acento(s)
    try:
        import vitart_modkit as K
        s = K.font_fix(s, lang)[0]
    except Exception:  # sem o modkit: só o que é seguro
        pass
    out = []
    for ch in s:
        if ord(ch) > 127 and (ch.isupper() or ord(ch) > 255):
            ch = _sem_acento(ch) or ''
        out.append(ch)
    return ''.join(out)


def traduzir(s, game, lang):
    if not lang or lang not in TEXTOS:
        return s
    return para_fonte(TEXTOS[lang].get(s, s), game, lang)
