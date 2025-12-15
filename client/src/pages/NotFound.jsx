import React from "react";
import Layout from "../components/Layout.jsx";

export default function NotFound() {
  return (
    <Layout>
      <div className="card">
        <h1 className="h1">404</h1>
        <p className="muted">Сторінку не знайдено.</p>
      </div>
    </Layout>
  );
}
