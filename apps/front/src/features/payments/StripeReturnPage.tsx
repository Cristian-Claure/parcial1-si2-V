import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Notice } from "../../shared/feedback/Notice";

export function StripeReturnPage() {
  const client = useQueryClient();
  useEffect(() => { const timer = window.setInterval(() => { void client.invalidateQueries({ queryKey: ["orders"] }); void client.invalidateQueries({ queryKey: ["payments"] }); }, 2500); return () => window.clearInterval(timer); }, [client]);
  return <section className="page centered"><span className="eyebrow">STRIPE</span><h1>Estamos validando su pago</h1><Notice>La web no marca el pago como confirmado por sí sola. El estado definitivo llega mediante el webhook firmado de Stripe en NestJS.</Notice><Link className="button primary" to="/mis-pedidos">Ver mis pedidos</Link></section>;
}
