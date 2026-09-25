import { useState, useRef, useEffect } from "react"
import type { Results } from "@mediapipe/face_mesh"
import * as faceMeshModule from "@mediapipe/face_mesh"
import * as cameraUtilsModule from "@mediapipe/camera_utils"

// Robust constructor resolution across ESM, CJS, Vite production bundling, and UMD
const FaceMeshConstructor =
  (faceMeshModule as any).FaceMesh ||
  (faceMeshModule as any).default?.FaceMesh ||
  (window as any).FaceMesh

const CameraConstructor =
  (cameraUtilsModule as any).Camera ||
  (cameraUtilsModule as any).default?.Camera ||
  (window as any).Camera

export function useFaceMesh(isRunning: boolean, onResults: (results: Results) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [visionError, setVisionError] = useState<string | null>(null)
  const faceMeshRef = useRef<any | null>(null)
  const cameraRef = useRef<any | null>(null)

  useEffect(() => {
    if (!videoRef.current) return

    const stopCamera = () => {
      try {
        if (cameraRef.current) {
          cameraRef.current.stop()
          cameraRef.current = null
        }
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream
          stream.getTracks().forEach(track => track.stop())
          videoRef.current.srcObject = null
        }
      } catch (err) {
        console.warn("[BioAdaptive] Camera cleanup warning:", err)
      }
      setIsLoaded(false)
    }

    if (isRunning) {
      try {
        if (!FaceMeshConstructor) {
          throw new Error("FaceMesh constructor missing from @mediapipe/face_mesh module export")
        }

        // Initialize FaceMesh instance safely
        if (!faceMeshRef.current) {
          const faceMesh = new FaceMeshConstructor({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
          })

          faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          })

          faceMeshRef.current = faceMesh
        }

        const faceMesh = faceMeshRef.current
        faceMesh.onResults(onResults)

        if (!cameraRef.current && videoRef.current && CameraConstructor) {
          cameraRef.current = new CameraConstructor(videoRef.current, {
            onFrame: async () => {
              try {
                if (videoRef.current && faceMeshRef.current && isRunning) {
                  await faceMeshRef.current.send({ image: videoRef.current })
                }
              } catch (frameErr) {
                console.warn("[BioAdaptive] Frame evaluation warning:", frameErr)
              }
            },
            width: 640,
            height: 480,
          })

          cameraRef.current.start()
            .then(() => setIsLoaded(true))
            .catch((camErr: any) => {
              console.warn("[BioAdaptive] Camera stream start warning:", camErr)
              setVisionError("Camera permission or stream unavailable")
              setIsLoaded(false)
            })
        }
      } catch (err) {
        console.error("[BioAdaptive] FaceMesh vision subsystem initialization failed safely:", err)
        setVisionError("MediaPipe FaceMesh initialization unavailable")
        stopCamera()
      }
    } else {
      stopCamera()
    }

    return () => {
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.onResults(() => {})
        } catch (_) {}
      }
    }
  }, [isRunning, onResults])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (cameraRef.current) cameraRef.current.stop()
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream
          stream.getTracks().forEach(track => track.stop())
        }
        if (faceMeshRef.current) faceMeshRef.current.close()
      } catch (_) {}
    }
  }, [])

  return { videoRef, isLoaded, visionError }
}
