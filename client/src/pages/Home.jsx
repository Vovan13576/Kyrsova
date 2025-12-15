import React from "react";
import Layout from "../components/Layout.jsx";

export default function Home() {
  return (
    <Layout>
      <div className="card">
        <h1 className="h1">Головна</h1>
        <p className="muted">
          Це новий клієнт під твій сервер. Далі ми підженемо точно під твої endpoint-и.
        </p>
        <div className="hr" />
        <div className="row">
          <div className="col card">
            <div className="badge">1</div>
            <h3 style={{ marginTop: 10 }}>Аналіз фото</h3>
            <p className="muted">Завантажуєш фото листка — отримуєш результат.</p>
          </div>
          <div className="col card">
            <div className="badge">2</div>
            <h3 style={{ marginTop: 10 }}>Історія</h3>
            <p className="muted">Перегляд збережених результатів аналізу.</p>
          </div>
          <div className="col card">
            <div className="badge">3</div>
            <h3 style={{ marginTop: 10 }}>Папки</h3>
            <p className="muted">Організація результатів по папках.</p>
          </div>
        </div>
      </div>
    </Layout>
  );
}
