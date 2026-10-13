import { useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, LoaderCircle, X } from 'lucide-react';

const DISCORD_SERVER_URL = 'https://discord.com/channels/1550788233506332734';

export default function OrderCheckout({ plan, popular }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [copied, setCopied] = useState(false);

  async function startOrder() {
    setOpen(true);
    setError('');
    setOrder(null);
    setCopied(false);
    setLoading(true);
    try {
      if (!globalThis.crypto?.randomUUID) {
        throw new Error('This browser cannot securely start checkout. Please update your browser or contact support.');
      }
      const response = await fetch('/api/v1/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.name, requestKey: globalThis.crypto.randomUUID() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 503 && payload.error === 'ordering_not_enabled') {
          throw new Error('Online ordering is not open yet. Your selection has not been charged or saved. Please contact HelzerX Cloud support.');
        }
        if (response.status === 404) {
          throw new Error('The order API route is not connected yet. Please contact support; no order was created.');
        }
        throw new Error(payload.message || 'Checkout could not be started. No payment was taken. Please try again later.');
      }
      if (!payload.discord?.claimCode || !payload.order?.reference) {
        throw new Error('The server returned an incomplete checkout response. Please contact support before retrying.');
      }
      setOrder(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }

  async function copyClaimCommand() {
    if (!order?.discord?.claimCode) return;
    const command = `/claim code:${order.discord.claimCode}`;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      setError('Clipboard access was blocked. Copy the claim code shown below manually.');
    }
  }

  return (
    <>
      <button type="button" className={`vps-buy-button ${popular ? 'primary' : ''}`} onClick={startOrder}>
        Buy now <ArrowRight size={14}/>
      </button>
      {open && (
        <div className="hx-checkout-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !loading) setOpen(false); }}>
          <section className="hx-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="hx-checkout-title">
            <button type="button" className="hx-checkout-close" aria-label="Close checkout" onClick={() => setOpen(false)} disabled={loading}><X size={18}/></button>
            <span className="hx-checkout-kicker">HELZERX CLOUD · SECURE ORDER</span>
            <h2 id="hx-checkout-title">{order ? 'Your order is ready for Discord' : 'Start your VPS order'}</h2>
            <div className="hx-checkout-plan">
              <span>{plan.name}</span>
              <strong>${plan.price.toFixed(2)} <small>/ month USD estimate</small></strong>
              <p>{plan.ram} GB RAM · {plan.cpu} vCPU · {plan.disk} GB NVMe</p>
            </div>
            {loading && <p className="hx-checkout-message"><LoaderCircle className="hx-checkout-spin" size={18}/> Creating a secure order request…</p>}
            {error && <p className="hx-checkout-error" role="alert">{error}</p>}
            {order && (
              <div className="hx-checkout-success" aria-live="polite">
                <p><Check size={16}/> Order created: <strong>{order.order.reference}</strong></p>
                <p className="hx-checkout-authoritative-price">Server catalogue amount: <strong>{order.order.currency} {Number(order.order.monthlyAmount).toFixed(2)} / month</strong></p>
                <p className="hx-checkout-help">This server-side catalogue amount is authoritative for the order. The CPU selector's displayed prices are estimates and may differ. Save this one-time claim code, then join the official Discord server and run the command below. The code expires in 30 minutes.</p>
                <label className="hx-checkout-code-label" htmlFor="hx-claim-code">One-time claim code</label>
                <code id="hx-claim-code" className="hx-checkout-code">{order.discord.claimCode}</code>
                <button type="button" className="hx-checkout-copy" onClick={copyClaimCommand}><Copy size={15}/>{copied ? 'Claim command copied' : 'Copy /claim command'}</button>
                <p className="hx-checkout-command">/claim code:{order.discord.claimCode}</p>
                <a className="hx-checkout-discord" href={DISCORD_SERVER_URL} target="_blank" rel="noreferrer">Open HelzerX Discord <ExternalLink size={15}/></a>
                <p className="hx-checkout-warning">Never share this code with anyone. Creating an order does not confirm payment or start VPS provisioning.</p>
              </div>
            )}
            {!loading && !order && !error && <p className="hx-checkout-help">We’ll create an order request first. Payment and VPS provisioning are not automatic at this stage.</p>}
            {!loading && !order && error && <button type="button" className="hx-checkout-retry" onClick={startOrder}>Try again</button>}
            <p className="hx-checkout-footnote">No payment is collected in this step.</p>
          </section>
        </div>
      )}
    </>
  );
}
