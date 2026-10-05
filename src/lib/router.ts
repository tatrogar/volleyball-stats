import { useEffect, useState } from "react";

function current(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export function useRoute(): string {
  const [route, setRoute] = useState(current());
  useEffect(() => {
    const onHash = () => {
      setRoute(current());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
