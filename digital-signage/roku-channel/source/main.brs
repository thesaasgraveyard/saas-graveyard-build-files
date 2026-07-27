' ═══════════════════════════════════════════════════════════
'  Digital Signage Player for Roku
'  Main entry point
' ═══════════════════════════════════════════════════════════

sub Main()
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.SetMessagePort(port)

    scene = screen.CreateScene("MainScene")
    screen.Show()

    ' Main event loop — keeps the channel running
    while true
        msg = wait(0, port)
        if type(msg) = "roSGScreenEvent"
            if msg.isScreenClosed()
                return
            end if
        end if
    end while
end sub
