# Privacy Policy 

Owner/Controller: Marcus Voelkel
Contact Email: mvoelkel@gmail.com
Address: Schoenhauser Allee 19, 10119 Berlin, Germany
Effective Date: 2025-08-17

1) What this extension does
- Injects a floating chat assistant into n8n pages to answer questions and create workflows on the canvas.
- Optional speech‑to‑text (microphone) sends recorded audio to OpenAI’s Whisper API for transcription.

2) Data we process
- Text you type in the chat input (sent to the selected OpenAI model to get an answer or to generate a workflow).
- Optional images/screenshots you attach/paste (sent to the model if attached).
- Optional audio recorded when you press the microphone: the audio clip is sent to OpenAI’s transcription endpoint (Whisper) to obtain text.
- Minimal page context for better troubleshooting (e.g., current URL, visible error snippets in n8n UI). This context is included in the prompt to improve answers and workflow generation.

3) Where data is sent (third parties)
- OpenAI API (model inference) at: https://api.openai.com/v1 (or your configured API base)
  - Models: gpt‑4o, gpt‑4o‑mini, gpt‑4.1, Whisper for transcription
  - We do not route prompts to any other third parties.

4) What we store locally (Chrome extension storage)
- Settings: UI language, model name, temperature, and your OpenAI API key (stored in Chrome’s extension storage).
- Per‑host activation toggle (whether to show the assistant on the current domain).
- Chat history is stored locally per host (for your convenience) and is not sent anywhere unless included in a new prompt.

5) What we do not store
- We do not run our own servers and do not collect analytics or telemetry.
- We do not persist your prompts, audio, or images outside of your local browser storage.

6) How long data is retained
- Settings and chat history remain in Chrome’s extension storage until you clear them (via the “Clear chat” button or by removing the extension).
- Requests to OpenAI are ephemeral; we do not control OpenAI’s retention. Please review OpenAI’s privacy policy and data retention settings: https://openai.com/policies

7) Legal basis / Purpose (if applicable under GDPR)
- Purpose: Provide AI assistance to answer questions and generate n8n workflows.
- Legal basis: [Your legal basis; e.g., consent or legitimate interests].

8) International data transfers
- Your prompts and optional media are sent to OpenAI’s API endpoints (which may be outside your country). Please review OpenAI’s documentation for data handling and subprocessors.

9) Your choices and controls
- You can disable the assistant per domain via the extension popup.
- You can clear chat history at any time using the “Clear chat” button.
- You can remove your OpenAI API key in the settings, disabling remote calls.
- You can remove the extension to stop all processing.

10) Children’s data
- This extension is not intended for use by children. Do not use the extension if you are under the legal age applicable in your jurisdiction.

11) Changes to this policy
- We may update this policy from time to time. We will update the “Effective Date” at the top of this document.

12) Contact
- For questions about this policy, contact: mvoelkel@gmail.com

---

# Datenschutzerklärung (Entwurf / Vorlage)

Verantwortlicher: Marcus Voelkel
Kontakt‑E‑Mail: mvoelkel@gmail.com
Adresse: Schoenhauer Allee 19, 10119 Berlin, Germany
Gültig ab: 2025-08-17

1) Zweck der Erweiterung
- Blendet ein Chat‑Modul in n8n ein, beantwortet Fragen und erstellt Workflows direkt auf dem Canvas.
- Optionales Speech‑to‑Text (Mikrofon) sendet aufgezeichnetes Audio an die Whisper‑API von OpenAI zur Transkription.

2) Verarbeitete Daten
- Von Ihnen eingegebene Texte im Chat (werden an das gewählte OpenAI‑Modell gesendet).
- Optional angehängte/eingefügte Bilder/Screenshots (werden an das Modell gesendet, falls beigefügt).
- Optional aufgezeichnetes Audio (nur wenn Sie das Mikrofon aktiv starten): wird zur Transkription an OpenAI gesendet.
- Minimale Seitenkontexte (z. B. aktuelle URL, sichtbare Fehlermeldungen in der n8n‑UI), um Antworten und Workflow‑Generierung zu verbessern.

3) Empfänger (Dritte)
- OpenAI API (Modell‑Inference) unter https://api.openai.com/v1 (oder Ihre konfigurierte API‑Basis)
  - Modelle: gpt‑4o, gpt‑4o‑mini, gpt‑4.1 (Chat), Whisper für Transkription
  - Keine weiteren Dritten.

4) Lokale Speicherung (Chrome‑Speicher)
- Einstellungen: UI‑Sprache, Modell, Temperatur, Ihr OpenAI API‑Key (im Speicher der Erweiterung).
- Aktivierungs‑Toggle pro Domain.
- Chat‑Verläufe lokal pro Host (nur lokal; werden nur versendet, wenn im Prompt enthalten).

5) Was nicht gespeichert wird
- Keine eigenen Server, keine Telemetrie.
- Keine langfristige Speicherung von Prompts/Audio/Bildern außerhalb Ihres Browsers.

6) Aufbewahrung
- Einstellungen und Chat‑Verläufe bleiben im Chrome‑Speicher, bis Sie diese löschen oder die Erweiterung entfernen.
- Anfragen an OpenAI sind flüchtig; bitte prüfen Sie OpenAIs Richtlinien: https://openai.com/policies

7) Rechtsgrundlage / Zweck (falls nach DSGVO erforderlich)
- Zweck: KI‑Assistenz zur Beantwortung von Fragen und Erstellung von n8n‑Workflows.
- Rechtsgrundlage: [Ihre Rechtsgrundlage; z. B. Einwilligung oder berechtigtes Interesse].

8) Internationale Datenübermittlungen
- Ihre Prompts/Medien werden an OpenAI gesendet (möglicherweise außerhalb Ihres Landes). Prüfen Sie bitte OpenAIs Hinweise zu Datenverarbeitung und Unterauftragsverarbeitern.

9) Ihre Rechte und Optionen
- Assistant pro Domain deaktivierbar über das Popup.
- Chat‑Verläufe jederzeit über „Chat löschen“ entfernbar.
- Entfernen des API‑Keys in den Einstellungen deaktiviert entfernte Aufrufe.
- Deinstallation der Erweiterung beendet die Verarbeitung.

10) Kinderdaten
- Die Erweiterung ist nicht für Kinder vorgesehen.

11) Änderungen
- Änderungen werden mit Datum „Gültig ab“ gekennzeichnet.

12) Kontakt
- Bei Fragen: mvoelkel@gmail.com

