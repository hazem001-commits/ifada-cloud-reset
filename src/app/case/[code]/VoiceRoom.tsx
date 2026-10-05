// ============================================================
// src/app/case/[code]/VoiceRoom.tsx
// الصوت الحي بين الفريق. اتصال واحد، ميكات، مؤشر يلي عم يحكي.
// ============================================================
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  createLocalAudioTrack,
} from "livekit-client";

interface Speaker {
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isLocal: boolean;
}

export default function VoiceRoom({
  sessionId,
  myName,
}: {
  sessionId: string;
  myName: string;
}) {
  const roomRef = useRef<Room | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);

  const refreshParticipants = useCallback((room: Room) => {
    const all: Speaker[] = [];

    // الأساس المشترك (Participant) — مش union المحلي/البعيد، لأن
    // trackPublications بكل واحد منهم Map بنوع publication مختلف.
    const pushOne = (p: Participant, isLocal: boolean) => {
      const micPub = Array.from(p.trackPublications.values()).find(
        (t) => t.source === Track.Source.Microphone,
      );
      all.push({
        identity: p.identity,
        name: p.name || "محقق",
        isSpeaking: p.isSpeaking,
        isMuted: !micPub || micPub.isMuted,
        isLocal,
      });
    };

    pushOne(room.localParticipant, true);
    room.remoteParticipants.forEach((p) => pushOne(p, false));
    setSpeakers(all);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      const res = await fetch("/api/voice-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (body.error === "VOICE_NOT_CONFIGURED") {
          setError("الصوت غير مفعّل على هالخادم لهلأ.");
        } else {
          setError("ما قدرنا نوصلك بالصوت. جرّب مرة ثانية.");
        }
        setConnecting(false);
        return;
      }

      const { token, url } = (await res.json()) as {
        token: string;
        url: string;
      };

      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room
        .on(RoomEvent.ActiveSpeakersChanged, () => refreshParticipants(room))
        .on(RoomEvent.ParticipantConnected, () => refreshParticipants(room))
        .on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room))
        .on(RoomEvent.TrackMuted, () => refreshParticipants(room))
        .on(RoomEvent.TrackUnmuted, () => refreshParticipants(room))

        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            const audioElement = track.attach();

            audioElement.autoplay = true;
            audioElement.style.display = "none";

            document.body.appendChild(audioElement);
          }
        })

        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((element) => {
            element.remove();
          });
        })
        .on(RoomEvent.Disconnected, () => {
          setConnected(false);
          setSpeakers([]);
        });

      await room.connect(url, token);

      const micTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
      });
      await room.localParticipant.publishTrack(micTrack);

      setConnected(true);
      refreshParticipants(room);
    } catch {
      setError("تعذّر تشغيل الميكروفون. تأكد من إذن الوصول.");
    } finally {
      setConnecting(false);
    }
  }, [sessionId, refreshParticipants]);

  async function disconnect() {
    await roomRef.current?.disconnect();
    roomRef.current = null;
    setConnected(false);
    setSpeakers([]);
  }

  function toggleMute() {
    const room = roomRef.current;
    if (!room) return;
    const next = !muted;
    void room.localParticipant.setMicrophoneEnabled(!next);
    setMuted(next);
    refreshParticipants(room);
  }

  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
    };
  }, []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        flexWrap: "wrap",
      }}
    >
      {!connected ? (
        <button
          className="btn btn-quiet"
          onClick={connect}
          disabled={connecting}
          aria-label={connecting ? "عم نوصل…" : "ادخل غرفة الصوت"}
        >
          <span aria-hidden="true">🎙</span>
          <span className="voice-label">{connecting ? " عم نوصل…" : " ادخل غرفة الصوت"}</span>
        </button>
      ) : (
        <>
          <button className="btn btn-quiet" onClick={toggleMute} aria-label={muted ? "الميكروفون مكتوم — افتحه" : "الميكروفون مفتوح — اكتمه"}>
            <span aria-hidden="true">{muted ? "🔇" : "🎙"}</span>
            <span className="voice-label">{muted ? " مكتوم" : " مفتوح"}</span>
          </button>
          <button className="btn btn-quiet" onClick={disconnect}>
            اخرج
          </button>

          <div className="voice-speakers" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {speakers.map((s) => (
              <span
                key={s.identity}
                title={s.name}
                style={{
                  fontSize: "var(--t-xs)",
                  padding: "0.2rem 0.55rem",
                  border: `1px solid ${s.isSpeaking ? "var(--signal)" : "var(--ink-line)"}`,
                  color: s.isSpeaking ? "var(--signal)" : "var(--paper-dim)",
                  borderRadius: "999px",
                }}
              >
                {s.isMuted ? "🔇" : "🎙"}{" "}
                {s.isLocal ? myName || s.name : s.name}
              </span>
            ))}
          </div>
        </>
      )}

      {error && (
        <span className="muted" style={{ fontSize: "var(--t-xs)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
