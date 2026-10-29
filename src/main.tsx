// RoomPitch: one React app with two pages.
//   /         the photo restyle page (src/photo)
//   /studio   the Room Studio: "New room" and the saved projects (src/studio)
//   /studio/room  the studio itself: plan, 3D view, estimate
// Each page loads only its own code and styles (three.js only comes with the studio).
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";

const PhotoPage = lazy(() => import("./photo/PhotoPage"));
const StudioApp = lazy(() => import("./studio/ui/StudioApp"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<PhotoPage />} />
          <Route path="/studio/*" element={<StudioApp />} />
          <Route path="/studio.html" element={<Navigate to="/studio" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>
);
