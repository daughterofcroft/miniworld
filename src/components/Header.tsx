import { ConnectButton } from "@mysten/dapp-kit";
import { Link } from "react-router-dom";

interface HeaderProps {
  epoch?: number;
}

export function Header({ epoch }: HeaderProps) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 24px",
        borderBottom: "1px solid var(--mw-border)",
        position: "sticky",
        top: 0,
        background: "rgba(10, 14, 20, 0.9)",
        backdropFilter: "blur(12px)",
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Link
          to="/worlds"
          style={{ textDecoration: "none" }}
        >
          <span
            style={{
              fontFamily: "var(--mw-font-logo)",
              fontSize: 24,
              color: "var(--mw-text)",
            }}
          >
            Miniworld
          </span>
        </Link>
        {epoch !== undefined && (
          <span
            style={{
              fontFamily: "var(--mw-font-mono)",
              fontSize: 12,
              color: "var(--mw-accent)",
              background: "var(--mw-accent-dim)",
              padding: "3px 12px",
              borderRadius: "var(--mw-r-full)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                background: "var(--mw-life)",
                borderRadius: "50%",
                display: "inline-block",
                animation: "heartbeat 2s ease-in-out infinite",
              }}
            />
            Epoch {epoch}
          </span>
        )}
      </div>
      <ConnectButton />
    </header>
  );
}
