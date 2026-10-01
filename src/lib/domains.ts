const VERCEL_API_BASE = "https://api.vercel.com/v10";

function getVercelHeaders() {
  const token = process.env.VERCEL_AUTH_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    return { headers: null, projectId: null };
  }

  return {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    projectId,
  };
}

function getDomainsUrl(projectId: string) {
  return `${VERCEL_API_BASE}/projects/${projectId}/domains`;
}

export interface VercelDomainResponse {
  uid: string;
  name: string;
  projectId: string;
  verified: boolean;
  verification: {
    type: "CNAME" | "A" | "TXT";
    domain: string;
    value: string;
    status: "pending" | "verified" | "failed";
    reason?: string;
  }[];
  createdAt: number;
  updatedAt: number;
}

export interface AddDomainResult {
  success: boolean;
  domain?: VercelDomainResponse;
  error?: string;
  mocked?: boolean;
}

export interface VerifyDomainResult {
  success: boolean;
  verified?: boolean;
  verification?: VercelDomainResponse["verification"];
  error?: string;
  mocked?: boolean;
}

export interface RemoveDomainResult {
  success: boolean;
  error?: string;
  mocked?: boolean;
}

export async function addDomainToVercel(domain: string): Promise<AddDomainResult> {
  const { headers, projectId } = getVercelHeaders();

  if (!headers || !projectId) {
    console.warn("[domains] Vercel credentials not configured, using mock response");
    return {
      success: true,
      domain: {
        uid: `mock_${Date.now()}`,
        name: domain,
        projectId: "mock_project",
        verified: false,
        verification: [
          {
            type: "CNAME",
            domain,
            value: "cname.vercel-dns.com",
            status: "pending",
          },
          {
            type: "A",
            domain,
            value: "76.76.21.21",
            status: "pending",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      mocked: true,
    };
  }

  try {
    const response = await fetch(getDomainsUrl(projectId), {
      method: "POST",
      headers,
      body: JSON.stringify({ name: domain }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || "Failed to add domain";
      return { success: false, error: errorMessage };
    }

    return { success: true, domain: data };
  } catch (error) {
    console.error("[domains] addDomainToVercel error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function verifyDomainOnVercel(domain: string): Promise<VerifyDomainResult> {
  const { headers, projectId } = getVercelHeaders();

  if (!headers || !projectId) {
    console.warn("[domains] Vercel credentials not configured, using mock response");
    return {
      success: true,
      verified: true,
      verification: [
        {
          type: "CNAME",
          domain,
          value: "cname.vercel-dns.com",
          status: "verified",
        },
        {
          type: "A",
          domain,
          value: "76.76.21.21",
          status: "verified",
        },
      ],
      mocked: true,
    };
  }

  try {
    const response = await fetch(`${getDomainsUrl(projectId)}/${domain}/verify`, {
      method: "POST",
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || "Failed to verify domain";
      return { success: false, error: errorMessage };
    }

    const verified = data.verified === true;
    return {
      success: true,
      verified,
      verification: data.verification,
    };
  } catch (error) {
    console.error("[domains] verifyDomainOnVercel error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function removeDomainFromVercel(domain: string): Promise<RemoveDomainResult> {
  const { headers, projectId } = getVercelHeaders();

  if (!headers || !projectId) {
    console.warn("[domains] Vercel credentials not configured, using mock response");
    return { success: true, mocked: true };
  }

  try {
    const response = await fetch(`${getDomainsUrl(projectId)}/${domain}`, {
      method: "DELETE",
      headers,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const errorMessage = data.error?.message || data.message || "Failed to remove domain";
      return { success: false, error: errorMessage };
    }

    return { success: true };
  } catch (error) {
    console.error("[domains] removeDomainFromVercel error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}

export async function getDomainFromVercel(domain: string): Promise<{
  success: boolean;
  domain?: VercelDomainResponse;
  error?: string;
  mocked?: boolean;
}> {
  const { headers, projectId } = getVercelHeaders();

  if (!headers || !projectId) {
    console.warn("[domains] Vercel credentials not configured, using mock response");
    return {
      success: true,
      domain: {
        uid: `mock_${domain}`,
        name: domain,
        projectId: "mock_project",
        verified: true,
        verification: [
          {
            type: "CNAME",
            domain,
            value: "cname.vercel-dns.com",
            status: "verified",
          },
          {
            type: "A",
            domain,
            value: "76.76.21.21",
            status: "verified",
          },
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      mocked: true,
    };
  }

  try {
    const response = await fetch(`${getDomainsUrl(projectId)}/${domain}`, {
      method: "GET",
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMessage = data.error?.message || data.message || "Failed to fetch domain";
      return { success: false, error: errorMessage };
    }

    return { success: true, domain: data };
  } catch (error) {
    console.error("[domains] getDomainFromVercel error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Network error",
    };
  }
}