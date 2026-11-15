import React from "react";
import { createRoot } from "react-dom/client";
import { QuestionDashboard } from "./QuestionDashboard";
import { useServiceUrl } from "./client";
import "@fontsource/cairo/arabic-400.css";
import "@fontsource/cairo/arabic-600.css";
import "@fontsource/cairo/arabic-800.css";
import "./style.css";
const wordmark = "./assets/wordmark-nav.svg";
function Portal() {
  const { base } = useServiceUrl();
  return (
    <>
      <header>
        <a href="https://ain-seen.marwanbarbood.com/">
          <img src={wordmark} alt="عين سين" />
        </a>
        <a href="https://ain-seen.marwanbarbood.com/">الرجوع للعبة</a>
      </header>
      <QuestionDashboard base={base} />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Portal />
  </React.StrictMode>,
);
