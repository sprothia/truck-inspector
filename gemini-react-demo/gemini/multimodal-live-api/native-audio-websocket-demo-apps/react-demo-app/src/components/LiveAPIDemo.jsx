import React, { useState, useEffect, useRef } from "react";
import { GeminiLiveAPI, MultimodalLiveResponseType } from "../utils/gemini-api";
import {
  AudioStreamer,
  VideoStreamer,
  AudioPlayer,
} from "../utils/media-utils";
import { INSPECTION_CHECKLIST } from "../data/inspectionChecklist";
import { INSPECTION_SYSTEM_INSTRUCTIONS } from "../utils/inspectionPrompts";
import { APP_CONFIG } from "../config";
import "./LiveAPIDemo.css";

const LiveAPIDemo = () => {
  const [inspectionStep, setInspectionStep] = useState(0);
  const [inspectionResults, setInspectionResults] = useState([]);
  const outputTranscriptRef = useRef("");
  const inspectionKickoffSent = useRef(false);
  const pendingVerdictRef = useRef(null);
  const inspectionStepRef = useRef(0);

  const [connected, setConnected] = useState(false);
  const [debugInfo, setDebugInfo] = useState("Ready");

  const clientRef = useRef(null);
  const audioStreamerRef = useRef(null);
  const videoStreamerRef = useRef(null);
  const audioPlayerRef = useRef(null);
  const videoPreviewRef = useRef(null);

  useEffect(() => {
    inspectionStepRef.current = inspectionStep;
  }, [inspectionStep]);

  const parsePassFail = (text, currentItemName) => {
    const lower = text.toLowerCase();
    if (/\b(don't|dont|can't|cant|won't|wont|not|to|we|i)\s+pass\b/i.test(lower)) return null;
    if (/\b(don't|dont|can't|cant|won't|wont|not)\s+fail\b/i.test(lower)) return null;
    const passMatch = lower.match(/\bpass\b[.:,]?\s*(.*)/);
    const failMatch = lower.match(/\bfail\b[.:,]?\s*(.*)/);
    const itemWords = (currentItemName || "").toLowerCase().split(/[\s_&]+/).filter((w) => w.length > 2);
    const hasItemMention = itemWords.length === 0 || itemWords.some((w) => lower.includes(w));
    if (passMatch && hasItemMention) return { pass: true, reason: passMatch[1].trim() || "Passed inspection" };
    if (failMatch && hasItemMention) return { pass: false, reason: failMatch[1].trim() || "Failed inspection" };
    return null;
  };

  const handleMessage = (message) => {
    setDebugInfo(`Message: ${message.type}`);

    switch (message.type) {
      case MultimodalLiveResponseType.AUDIO:
        if (audioPlayerRef.current) {
          audioPlayerRef.current.play(message.data);
        }
        break;
      case MultimodalLiveResponseType.OUTPUT_TRANSCRIPTION:
        outputTranscriptRef.current += message.data.text;
        if (message.data.finished) {
          const fullText = outputTranscriptRef.current;
          outputTranscriptRef.current = "";
          const s = inspectionStepRef.current;
          if (s < INSPECTION_CHECKLIST.length) {
            const item = INSPECTION_CHECKLIST[s];
            const parsed = parsePassFail(fullText, item.name);
            if (parsed) {
              pendingVerdictRef.current = { stepId: item.id, ...parsed };
            }
          }
        }
        break;
      case MultimodalLiveResponseType.SETUP_COMPLETE:
        if (!inspectionKickoffSent.current) {
          inspectionKickoffSent.current = true;
          setTimeout(() => {
            if (clientRef.current) {
              clientRef.current.sendTextMessage("Please begin the inspection with an introduction.");
            }
          }, 1500);
        }
        break;
      case MultimodalLiveResponseType.TOOL_CALL: {
        const functionCalls = message.data.functionCalls;
        functionCalls.forEach((functionCall) => {
          const { name, args } = functionCall;
          clientRef.current.callFunction(name, args);
        });
        break;
      }
      case MultimodalLiveResponseType.TURN_COMPLETE:
        if (pendingVerdictRef.current) {
          const verdict = pendingVerdictRef.current;
          pendingVerdictRef.current = null;
          void (async () => {
            if (audioPlayerRef.current) {
              await audioPlayerRef.current.waitForPlaybackIdle();
            }
            setInspectionResults((r) => [...r, verdict]);
            setInspectionStep((s) => {
              const nextStep = Math.min(s + 1, INSPECTION_CHECKLIST.length);
              if (nextStep < INSPECTION_CHECKLIST.length && clientRef.current) {
                const nextItem = INSPECTION_CHECKLIST[nextStep];
                setTimeout(() => {
                  if (clientRef.current?.connected) {
                    clientRef.current.sendTextMessage(
                      `Next item: ${nextItem.name}. Ask the driver to show the ${nextItem.name} for a fresh inspection - do not use frames from the previous step.`
                    );
                  }
                }, 300);
              }
              return nextStep;
            });
          })();
        }
        break;
      case MultimodalLiveResponseType.INTERRUPTED:
        if (audioPlayerRef.current) {
          audioPlayerRef.current.interrupt();
        }
        break;
      default:
        break;
    }
  };

  const disconnect = () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    if (audioStreamerRef.current) {
      audioStreamerRef.current.stop();
      audioStreamerRef.current = null;
    }
    if (videoStreamerRef.current) {
      videoStreamerRef.current.stop();
      videoStreamerRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.destroy();
      audioPlayerRef.current = null;
    }

    setConnected(false);
    inspectionKickoffSent.current = false;
    pendingVerdictRef.current = null;
    setInspectionStep(0);
    setInspectionResults([]);

    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
      videoPreviewRef.current.hidden = true;
    }
  };

  useEffect(() => {
    return () => disconnect();
  }, []);

  const connect = async () => {
    const { proxyUrl, projectId, model, voice, volume } = APP_CONFIG;

    if (!proxyUrl || !projectId) {
      alert("Set VITE_PROXY_URL and VITE_PROJECT_ID in .env (see .env.example)");
      return;
    }

    try {
      setInspectionStep(0);
      setInspectionResults([]);

      clientRef.current = new GeminiLiveAPI(proxyUrl, projectId, model);

      clientRef.current.systemInstructions = INSPECTION_SYSTEM_INSTRUCTIONS;
      clientRef.current.inputAudioTranscription = true;
      clientRef.current.outputAudioTranscription = true;
      clientRef.current.googleGrounding = false;
      clientRef.current.enableAffectiveDialog = true;
      clientRef.current.responseModalities = ["AUDIO"];
      clientRef.current.voiceName = voice;
      clientRef.current.temperature = 1.0;
      clientRef.current.proactivity = { proactiveAudio: true };
      clientRef.current.automaticActivityDetection = {
        disabled: false,
        silence_duration_ms: 400,
        prefix_padding_ms: 300,
        end_of_speech_sensitivity: "END_SENSITIVITY_HIGH",
        start_of_speech_sensitivity: "START_SENSITIVITY_LOW",
      };

      clientRef.current.onReceiveResponse = handleMessage;
      clientRef.current.onErrorMessage = (error) => {
        setDebugInfo("Error: " + error);
      };
      clientRef.current.onConnectionStarted = () => setConnected(true);
      clientRef.current.onClose = () => disconnect();

      await clientRef.current.connect();

      audioStreamerRef.current = new AudioStreamer(clientRef.current);
      videoStreamerRef.current = new VideoStreamer(clientRef.current);
      audioPlayerRef.current = new AudioPlayer();
      await audioPlayerRef.current.init();
      audioPlayerRef.current.setVolume(volume / 100);

      await audioStreamerRef.current.start();
      const video = await videoStreamerRef.current.start({
        facingMode: "environment",
      });
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = video.srcObject;
      }

      setDebugInfo("Connected");
    } catch (error) {
      setDebugInfo("Error: " + error.message);
    }
  };

  const inspectionComplete = inspectionStep >= INSPECTION_CHECKLIST.length;

  return (
    <div className="live-api-demo">
      {!connected ? (
        <div className="hero">
          <div className="hero-glow" aria-hidden />
          <div className="hero-inner">
            <div className="hero-icon-wrap">
              <svg className="hero-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path d="M8 32h4l2-8h16l2 8h4v4H8v-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <path d="M14 24h20l-2-8H16l-2 8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                <circle cx="16" cy="36" r="3" stroke="currentColor" strokeWidth="2" />
                <circle cx="32" cy="36" r="3" stroke="currentColor" strokeWidth="2" />
                <path d="M28 12h8v6h-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="hero-badge">9 steps</div>
            <h1 className="hero-title">Truck Inspection</h1>
            <p className="hero-subtitle">
              Point your camera at each part. The assistant guides you and marks pass or fail as you go.
            </p>
            <button
              type="button"
              onClick={connect}
              className="button-connect button-connect--hero"
            >
              <span className="button-connect-label">Start inspection</span>
              <svg className="button-connect-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="main-screen main-screen--active">
          <header className="header-bar">
            <div className="header-bar-left">
              <div className="header-bar-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M4 18h2l1-5h10l1 5h2v2H4v-2z" strokeLinejoin="round" />
                  <circle cx="8" cy="20" r="1.5" />
                  <circle cx="16" cy="20" r="1.5" />
                  <path d="M6 13h12l-1-4H7l-1 4z" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <h1 className="header-bar-title">Truck Inspection</h1>
                <p className="header-bar-meta">Step {Math.min(inspectionStep + 1, INSPECTION_CHECKLIST.length)} of {INSPECTION_CHECKLIST.length}</p>
              </div>
            </div>
            <span className="live-pill">
              <span className="live-pill-dot" />
              Live
            </span>
          </header>

          <div className="inspection-camera">
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              muted
              className="video-preview inspection-video"
            />
          </div>
          <div className="checklist-table">
            <div className="checklist-table-header">
              <span>#</span>
              <span>Item</span>
              <span>Status</span>
            </div>
            {INSPECTION_CHECKLIST.map((item, i) => {
              const result = inspectionResults[i];
              const isCurrent = i === inspectionStep && !inspectionComplete;
              const status = result ? (result.pass ? "pass" : "fail") : isCurrent ? "current" : "pending";
              const statusLabel = result ? (result.pass ? "Pass" : "Fail") : isCurrent ? "..." : "—";
              return (
                <div key={item.id} className={`checklist-row checklist-row--${status}`}>
                  <span className="checklist-num">{i + 1}</span>
                  <span className="checklist-name">{item.name}</span>
                  <span className={`checklist-status checklist-status--${status}`}>{statusLabel}</span>
                </div>
              );
            })}
          </div>

          <div className="footer-cta">
            <button type="button" onClick={disconnect} className="button-connect disconnect">
              End inspection
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveAPIDemo;
