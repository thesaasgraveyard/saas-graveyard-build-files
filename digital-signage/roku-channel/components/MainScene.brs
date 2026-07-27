' ═══════════════════════════════════════════════════════════
'  MainScene.brs  —  Digital Signage Player
'  Handles slideshow logic, timing, and video playback.
' ═══════════════════════════════════════════════════════════

sub init()
    m.cfg = GetConfig()

    m.posterA     = m.top.findNode("posterA")
    m.posterB     = m.top.findNode("posterB")
    m.videoPlayer = m.top.findNode("videoPlayer")
    m.statusBg    = m.top.findNode("statusBg")
    m.statusLabel = m.top.findNode("statusLabel")

    m.playlist     = []
    m.currentIndex = 0
    m.showingA     = false
    m.playing      = false
    m.isRetrying   = false

    m.slideTimer = CreateObject("roSGNode", "Timer")
    m.slideTimer.repeat = false
    m.slideTimer.observeField("fire", "onSlideTimer")

    m.refreshTimer = CreateObject("roSGNode", "Timer")
    m.refreshTimer.duration = m.cfg.refreshInterval
    m.refreshTimer.repeat   = true
    m.refreshTimer.observeField("fire", "onRefreshTimer")

    m.loaderTask = CreateObject("roSGNode", "PlaylistLoader")
    m.loaderTask.observeField("result", "onPlaylistResult")

    m.videoPlayer.observeField("state", "onVideoState")

    showStatus("Loading content...")
    startLoad()
end sub

sub startLoad()
    url = m.cfg.playlistUrl
    if url = "YOUR_GOOGLE_APPS_SCRIPT_URL_HERE" or url = "" or url = invalid
        msg = "Setup needed:" + chr(10) + chr(10)
        msg = msg + "Open  source/config.brs" + chr(10)
        msg = msg + "Paste in your Google Apps Script URL," + chr(10)
        msg = msg + "then re-zip and re-upload the channel."
        showStatus(msg)
        return
    end if
    m.loaderTask.url = url
    m.loaderTask.control = "RUN"
end sub

sub onPlaylistResult()
    result = m.loaderTask.result
    if result <> invalid and result.Count() > 0
        if not m.playing
            ' First load — start playback
            m.playlist     = result
            m.playing      = true
            m.currentIndex = 0
            hideStatus()
            showSlide(0)
            m.refreshTimer.control = "start"
        else
            ' Background refresh — only update visually if something changed.
            ' For a single static image, skip entirely if the URL is the same
            ' so the screen is never touched and shows zero gaps.
            if result.Count() = 1 and m.playlist.Count() = 1
                r0 = result[0]
                p0 = m.playlist[0]
                if r0 <> invalid and p0 <> invalid
                    if r0.DoesExist("url") and p0.DoesExist("url")
                        if r0.url = p0.url
                            return
                        end if
                    end if
                end if
            end if
            m.playlist = result
            if m.currentIndex >= m.playlist.Count()
        m.currentIndex = 0
    end if
        end if
    else
        if not m.playing
            msg = "Could not load content." + chr(10) + chr(10)
            msg = msg + "Retrying in 30 seconds..." + chr(10) + chr(10)
            msg = msg + "Check:" + chr(10)
            msg = msg + "  Apps Script deployed as 'Anyone'" + chr(10)
            msg = msg + "  URL is correct in source/config.brs" + chr(10)
            msg = msg + "  Drive folder has images or videos"
            showStatus(msg)
            m.isRetrying          = true
            m.slideTimer.duration = 30
            m.slideTimer.control  = "start"
        end if
    end if
end sub

sub onRefreshTimer()
    m.loaderTask.control = "STOP"
    m.loaderTask.control = "RUN"
end sub

sub showSlide(idx as Integer)
    if m.playlist.Count() = 0
        return
    end if
    if idx < 0
        idx = m.playlist.Count() - 1
    end if
    if idx >= m.playlist.Count()
        idx = 0
    end if
    m.currentIndex = idx
    item = m.playlist[idx]
    if item = invalid
        advanceSlide()
        return
    end if
    t = LCase(item.type)
    if t = "image"
        showImage(item)
    else if t = "video"
        showVideo(item)
    else
        advanceSlide()
    end if
end sub

' Two Poster nodes let one preload while the other displays.
' We instant-swap opacity — reliable across all Roku firmware.
sub showImage(item as Object)
    m.slideTimer.control  = "stop"
    m.videoPlayer.control = "stop"
    m.videoPlayer.visible = false

    if m.showingA
        m.posterB.uri     = item.url
        m.posterA.opacity = 0
        m.posterB.opacity = 1
        m.showingA        = false
    else
        m.posterA.uri     = item.url
        m.posterA.opacity = 1
        m.posterB.opacity = 0
        m.showingA        = true
    end if

    m.isRetrying = false

    ' Single-image playlist: no timer needed — image stays on screen
    ' permanently with zero swaps or gaps. Only updates when the file
    ' in Google Drive actually changes (detected by background refresh).
    if m.playlist.Count() = 1
        return
    end if

    ' Multi-image playlist: advance after the configured duration
    dur = m.cfg.imageDuration
    if item.DoesExist("duration") and item.duration > 0
        dur = item.duration
    end if
    m.slideTimer.duration = dur
    m.slideTimer.control  = "start"
end sub

sub showVideo(item as Object)
    m.slideTimer.control = "stop"
    m.posterA.opacity    = 0
    m.posterB.opacity    = 0
    m.showingA           = false

    content = CreateObject("roSGNode", "ContentNode")
    content.url          = item.url
    content.streamformat = "mp4"

    m.videoPlayer.content = content
    m.videoPlayer.visible = true

    ' For single-video playlists, loop seamlessly with zero gap.
    ' This also suppresses the Roku screensaver since active video
    ' playback is always treated as user activity by the OS.
    if m.playlist.Count() = 1
        m.videoPlayer.loop = true
    else
        m.videoPlayer.loop = false
    end if

    m.videoPlayer.control = "play"
end sub

sub onVideoState()
    state = m.videoPlayer.state
    if state = "error"
        m.videoPlayer.control = "stop"
        m.videoPlayer.visible = false
        advanceSlide()
    else if state = "finished"
        ' When loop = true, this won't fire (Roku loops internally).
        ' This only triggers for multi-item playlists where loop = false.
        m.videoPlayer.control = "stop"
        m.videoPlayer.visible = false
        advanceSlide()
    end if
end sub


sub onSlideTimer()
    if m.isRetrying
        m.isRetrying = false
        startLoad()
    else
        advanceSlide()
    end if
end sub

sub advanceSlide()
    m.slideTimer.control = "stop"
    if m.playlist.Count() = 0
        return
    end if
    m.currentIndex = (m.currentIndex + 1) mod m.playlist.Count()
    showSlide(m.currentIndex)
end sub

sub showStatus(msg as String)
    m.statusLabel.text    = msg
    m.statusBg.visible    = true
    m.statusLabel.visible = true
end sub

sub hideStatus()
    m.statusBg.visible    = false
    m.statusLabel.visible = false
end sub

function onKeyEvent(key as String, press as Boolean) as Boolean
    if press
        if key = "OK" or key = "options"
            showStatus("Refreshing content...")
            startLoad()
            return true
        end if
        if key = "right"
            advanceSlide()
            return true
        end if
    end if
    return false
end function
