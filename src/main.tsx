// RoomPitch: one React app.
//   /         the landing page (src/landing). The photo restyle page (src/photo) is kept in the code but not
//             reachable: give it a route again to bring it back.
//   /studio   the Room Studio: "New room" and the saved projects (src/studio)
//   /studio/room  the studio itself: plan, 3D view, estimate
// Each page loads only its own code and styles (three.js only comes with the studio).
import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";

// Not routed for now (see above); kept so the restyle page can come back with one line.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PhotoPage = lazy(() => import("./photo/PhotoPage"));
const LandingPage = lazy(() => import("./landing/LandingPage"));
const StudioApp = lazy(() => import("./studio/ui/StudioApp"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/studio/*" element={<StudioApp />} />
          <Route path="/studio.html" element={<Navigate to="/studio" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>
);
