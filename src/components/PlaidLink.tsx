import { Button } from "./ui/button";
import {
  PlaidLinkOnSuccess,
  PlaidLinkOnSuccessMetadata,
  usePlaidLink,
} from "react-plaid-link";
import {
  PlaidLinkOnExit,
  PlaidLinkOnExitMetadata,
  PlaidLinkError,
} from "react-plaid-link";
import {
  PlaidLinkOnEvent,
  PlaidLinkOnEventMetadata,
  PlaidLinkStableEvent,
} from "react-plaid-link";
import { useCallback, useEffect, useState } from "react";

export function PlaidLink() {
  const [linkToken, setLinkToken] = useState<string | null>(null);

  useEffect(() => {
    // fetch link token from server
    fetch("/api/plaid/link-token", { method: "POST" })
      .then((res) => res.json())
      .then(({ link_token }) => setLinkToken(link_token));
  }, []);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    (public_token: string, metadata: PlaidLinkOnSuccessMetadata) => {
      // log and save metadata
      // exchange public token (if using Item-based products)
      fetch("/api/plaid/exchange-token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          public_token,
          institution_id: metadata.institution?.institution_id,
          institution_name: metadata.institution?.name,
          link_session_id: metadata.link_session_id,
        }),
      });
    },
    [],
  );

  const onExit = useCallback<PlaidLinkOnExit>(
    (error: PlaidLinkError | null, metadata: PlaidLinkOnExitMetadata) => {
      if (error != null && error.error_code === "INVALID_LINK_TOKEN") {
        // token expired or invalid, fetch a new one
        fetch("/api/plaid/link-token", { method: "POST" })
          .then((res) => res.json())
          .then(({ link_token }) => setLinkToken(link_token));
      }
      if (error != null) {
        console.error("Plaid Link exit error:", error);
      }
    },
    [],
  );

  const onEvent = useCallback<PlaidLinkOnEvent>(
    (
      eventName: PlaidLinkStableEvent | string,
      metadata: PlaidLinkOnEventMetadata,
    ) => {
      console.log("Plaid Link event:", eventName, metadata);
    },
    [],
  );

  const config = {
    token: linkToken,
    onSuccess,
    onExit,
    onEvent,
  };

  const { open, exit, ready } = usePlaidLink(config);

  return (
    <Button onClick={() => open()} disabled={!ready}>
      Add Bank Account
    </Button>
  );
}
