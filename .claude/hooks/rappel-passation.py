#!/usr/bin/env python3
"""Hook UserPromptSubmit : rappelle de proposer une passation quand le contexte coûte cher.
Taille du contexte = usage du dernier message de Claude dans le transcript. Un rappel par
palier (seuil doux, seuil fort, puis tous les 100k) et au retour d'une pause > 1 h (cache
expiré). Seuils réglables : variables PASSATION_SEUIL_DOUX et PASSATION_SEUIL_FORT."""
import json, os, sys, tempfile
from datetime import datetime, timezone

DOUX = int(os.environ.get("PASSATION_SEUIL_DOUX", 200000))
FORT = int(os.environ.get("PASSATION_SEUIL_FORT", 300000))
PAS, PAUSE_MIN = 100000, 60
CLES = ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "output_tokens")


def contexte(chemin):
    with open(chemin, "rb") as f:
        taille = f.seek(0, 2)
        for bloc in (3_000_000, taille):  # la fin du fichier suffit presque toujours
            f.seek(max(0, taille - bloc))
            for ligne in reversed(f.read().splitlines()):
                if b'"usage"' not in ligne:
                    continue
                try:
                    o = json.loads(ligne)
                except ValueError:
                    continue
                m = o.get("message")
                u = m.get("usage") if isinstance(m, dict) else None
                if o.get("type") == "assistant" and u and not o.get("isSidechain"):
                    return sum(u.get(k) or 0 for k in CLES), o.get("timestamp")
    return 0, None


def minutes_depuis(ts):
    try:
        t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - t).total_seconds() / 60
    except (AttributeError, ValueError):
        return 0


def main():
    try:
        e = json.load(sys.stdin)
        n, ts = contexte(e["transcript_path"])
    except Exception:
        return
    etat = os.path.join(tempfile.gettempdir(), "claude-passation-%s" % e.get("session_id", "x"))
    try:
        deja = int(open(etat).read())
    except (OSError, ValueError):
        deja = -1
    if n < DOUX:
        if deja >= 0:
            os.remove(etat)
        return
    palier = 0 if n < FORT else 1 + (n - FORT) // PAS
    pause = minutes_depuis(ts) > PAUSE_MIN
    if palier <= deja and not pause:
        return
    with open(etat, "w") as f:
        f.write(str(palier))
    k = n // 1000
    quand = ("Termine d'abord la demande ou l'étape en cours, puis" if palier == 0
             else "Avant d'entamer une nouvelle tâche longue,")
    raison = (" L'utilisateur revient d'une pause de plus d'une heure : le cache a expiré et"
              " la prochaine réponse relit tout le contexte au prix fort." if pause else "")
    texte = (f"[Rappel passation] Contexte ≈ {k}k tokens (seuils {DOUX // 1000}k / {FORT // 1000}k)."
             f" Chaque appel relit tout ce contexte.{raison} {quand} propose en une phrase une"
             " passation vers une nouvelle session, sans la lancer d'office. S'il accepte : mets à"
             " jour le fichier de passation du projet (but, état, décisions, fichiers clés,"
             " commandes, prochaine étape, préférences), commit + push, puis donne-lui un prompt"
             " court à coller dans la nouvelle session. S'il refuse, n'insiste pas avant le"
             " palier suivant.")
    print(json.dumps({"systemMessage": f"Contexte ≈ {k}k tokens : passation conseillée.",
                      "hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                                             "additionalContext": texte}}, ensure_ascii=False))


main()
