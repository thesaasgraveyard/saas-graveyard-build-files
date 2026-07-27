' ═══════════════════════════════════════════════════════════
'  PlaylistLoader.brs  —  Background Task
'
'  Fetches the playlist JSON from the Google Apps Script URL.
'  Runs on a separate thread so the UI never freezes.
'
'  Input field:   url    (string) — Web App URL to fetch
'  Output field:  result (array)  — parsed playlist items
' ═══════════════════════════════════════════════════════════

sub init()
    m.top.functionName = "fetchPlaylist"
end sub

sub fetchPlaylist()
    url = m.top.url
    if url = "" or url = invalid
        m.top.result = []
        return
    end if

    ' ── Add a cache-buster so we always get fresh content ────
    sep = "?"
    if Instr(1, url, "?") > 0 then sep = "&"
    ts  = Str(CreateObject("roDateTime").AsSeconds()).Trim()
    url = url + sep + "bust=" + ts

    ' ── Make the HTTP request ────────────────────────────────
    http = CreateObject("roUrlTransfer")
    http.SetCertificatesFile("common:/certs/ca-bundle.crt")
    http.InitClientCertificates()
    http.EnableEncodings(true)
    http.SetUrl(url)
    http.AddHeader("Accept", "application/json")

    body = http.GetToString()

    if body = "" or body = invalid
        m.top.result = []
        return
    end if

    ' ── Parse JSON ───────────────────────────────────────────
    parsed = ParseJSON(body)
    if parsed = invalid or type(parsed) <> "roArray"
        m.top.result = []
        return
    end if

    ' ── Build clean playlist array ───────────────────────────
    playlist = []

    for each raw in parsed
        ' Skip error objects or malformed items
        if type(raw) <> "roAssociativeArray" then goto nextItem
        if not raw.DoesExist("url")           then goto nextItem
        if not raw.DoesExist("type")          then goto nextItem
        if raw.url = "" or raw.url = invalid  then goto nextItem

        entry = {
            type     : LCase(raw.type),
            url      : raw.url,
            name     : "",
            duration : 10
        }

        if raw.DoesExist("name")     and raw.name <> invalid     then entry.name     = raw.name
        if raw.DoesExist("duration") and raw.duration <> invalid then entry.duration = raw.duration

        playlist.Push(entry)

        nextItem:
    end for

    m.top.result = playlist
end sub
