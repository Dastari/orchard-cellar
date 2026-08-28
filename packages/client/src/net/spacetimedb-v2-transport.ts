const V2_PROTOCOL = 'v2.bsatn.spacetimedb';

interface SpacetimeSocketArgs {
  readonly url: URL;
  readonly nameOrAddress: string;
  readonly authToken?: string;
  readonly lightMode: boolean;
  readonly confirmedReads?: boolean;
}

interface SpacetimeSocketAdapter {
  readonly protocol: string;
  readonly readyState: number;
  send(message: Uint8Array<ArrayBuffer>): void;
  close(): void;
  set onopen(handler: () => void);
  set onclose(handler: (event: CloseEvent) => void);
  set onerror(handler: (event: ErrorEvent) => void);
  set onmessage(handler: (message: { data: Uint8Array }) => void);
}

export function v2SubscribeUrl(
  baseUrl: URL,
  nameOrAddress: string,
  temporaryAuthToken?: string,
  lightMode = false,
  confirmedReads?: boolean,
): URL {
  const databaseUrl = new URL(`v1/database/${nameOrAddress}/subscribe`, baseUrl);
  const connectionId = baseUrl.searchParams.get('connection_id');
  if (connectionId !== null) databaseUrl.searchParams.set('connection_id', connectionId);
  if (temporaryAuthToken !== undefined) databaseUrl.searchParams.set('token', temporaryAuthToken);
  databaseUrl.searchParams.set('compression', 'None');
  if (lightMode) databaseUrl.searchParams.set('light', 'true');
  if (confirmedReads !== undefined) databaseUrl.searchParams.set('confirmed', String(confirmedReads));
  return databaseUrl;
}

class V2UncompressedSocket implements SpacetimeSocketAdapter {
  constructor(private readonly socket: WebSocket) {}

  get protocol(): string { return this.socket.protocol; }
  get readyState(): number { return this.socket.readyState; }
  send(message: Uint8Array<ArrayBuffer>): void { this.socket.send(message); }
  close(): void { this.socket.close(); }
  set onopen(handler: () => void) { this.socket.onopen = handler; }
  set onclose(handler: (event: CloseEvent) => void) { this.socket.onclose = handler; }
  set onerror(handler: (event: ErrorEvent) => void) {
    this.socket.onerror = handler as (event: Event) => void;
  }
  set onmessage(handler: (message: { data: Uint8Array }) => void) {
    this.socket.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const packet = new Uint8Array(event.data);
      // SpacetimeDB prefixes every server frame with its compression mode,
      // including mode 0 (none). The SDK adapter normally removes this byte.
      if (packet[0] !== 0) {
        console.error('[SpacetimeDB] Expected an uncompressed V2 websocket frame.');
        this.socket.close();
        return;
      }
      handler({ data: packet.subarray(1) });
    };
  }
}

export async function openSpacetimeV2Socket({
  url,
  nameOrAddress,
  authToken,
  lightMode,
  confirmedReads,
}: SpacetimeSocketArgs): Promise<SpacetimeSocketAdapter> {
  let temporaryAuthToken: string | undefined;
  if (authToken !== undefined) {
    const tokenUrl = new URL('v1/identity/websocket-token', url);
    tokenUrl.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) throw new Error(`Failed to verify token: ${response.statusText}`);
    temporaryAuthToken = (await response.json() as { token: string }).token;
  }

  const socket = new WebSocket(v2SubscribeUrl(
    url,
    nameOrAddress,
    temporaryAuthToken,
    lightMode,
    confirmedReads,
  ), [V2_PROTOCOL]);
  socket.binaryType = 'arraybuffer';
  return new V2UncompressedSocket(socket);
}
