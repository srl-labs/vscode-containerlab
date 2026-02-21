import LaunchIcon from "@mui/icons-material/Launch";
import StarIcon from "@mui/icons-material/Star";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  Link,
  List,
  ListItem,
  ListItemButton,
  Paper,
  Stack,
  Typography,
  Checkbox
} from "@mui/material";
import React from "react";
import { createRoot } from "react-dom/client";

import { MuiThemeProvider } from "../../reactTopoViewer/webview/theme";
import { useMessageListener, usePostMessage } from "../shared/hooks";
import containerlabLogo from "../../../resources/containerlab.svg";

interface PopularRepo {
  name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
}

interface WelcomeInitialData {
  extensionVersion?: string;
}

interface WelcomeReposLoadedMessage {
  command: "reposLoaded";
  repos?: PopularRepo[];
  usingFallback?: boolean;
}

type WelcomeIncomingMessage = WelcomeReposLoadedMessage;

type WelcomeOutgoingMessage =
  | { command: "createExample" }
  | { command: "dontShowAgain"; value: boolean }
  | { command: "getRepos" };

const RESOURCE_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "Containerlab Documentation", href: "https://containerlab.dev/" },
  {
    label: "VS Code Extension Documentation",
    href: "https://containerlab.dev/manual/vsc-extension/"
  },
  { label: "Browse Labs on GitHub (srl-labs)", href: "https://github.com/srl-labs/" },
  {
    label: 'Find more labs tagged with "clab-topo"',
    href: "https://github.com/search?q=topic%3Aclab-topo++fork%3Atrue&type=repositories"
  },
  { label: "Join our Discord server", href: "https://discord.gg/vAyddtaEV9" },
  {
    label: "Download cshargextcap Wireshark plugin",
    href: "https://github.com/siemens/cshargextcap/releases/latest"
  }
];

const COMMUNITY_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  {
    label: "Extension Releases",
    href: "https://github.com/srl-labs/vscode-containerlab/releases/"
  },
  {
    label: "Containerlab Latest Release",
    href: "https://github.com/srl-labs/containerlab/releases/latest"
  },
  {
    label: "Containerlab Release History",
    href: "https://github.com/srl-labs/containerlab/releases/"
  },
  { label: "Discord", href: "https://discord.gg/vAyddtaEV9" }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toWelcomeInitialData(value: unknown): WelcomeInitialData {
  if (!isRecord(value)) {
    return {};
  }
  return {
    extensionVersion:
      typeof value.extensionVersion === "string" ? value.extensionVersion : undefined
  };
}

function WelcomePageApp(): React.JSX.Element {
  const initialData = toWelcomeInitialData(window.__INITIAL_DATA__);
  const extensionVersion = initialData.extensionVersion ?? "unknown";

  const postMessage = usePostMessage<WelcomeOutgoingMessage>();

  const [dontShowAgain, setDontShowAgain] = React.useState(false);
  const [repos, setRepos] = React.useState<PopularRepo[]>([]);
  const [usingFallback, setUsingFallback] = React.useState(false);
  const [isLoadingRepos, setIsLoadingRepos] = React.useState(true);

  useMessageListener<WelcomeIncomingMessage>((message) => {
    setRepos(Array.isArray(message.repos) ? message.repos : []);
    setUsingFallback(Boolean(message.usingFallback));
    setIsLoadingRepos(false);
  });

  React.useEffect(() => {
    postMessage({ command: "getRepos" });
  }, [postMessage]);

  return (
    <MuiThemeProvider>
      <Box
        sx={{
          width: "100%",
          height: "100%",
          overflowY: "auto",
          backgroundColor: "background.default",
          color: "text.primary"
        }}
      >
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Paper
            variant="outlined"
            sx={{
              p: { xs: 2, md: 3 },
              borderColor: "divider",
              backgroundColor: (theme) => theme.alpha(theme.palette.background.paper, 0.92)
            }}
          >
            <Stack spacing={3}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems="flex-start">
                <Box
                  component="img"
                  src={containerlabLogo}
                  alt="Containerlab"
                  sx={{
                    width: { xs: 56, md: 64 },
                    height: { xs: 56, md: 64 },
                    objectFit: "contain",
                    flexShrink: 0
                  }}
                />
                <Stack spacing={1} sx={{ minWidth: 0 }}>
                  <Typography variant="h4" sx={{ lineHeight: 1.2 }}>
                    Welcome to Containerlab
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`Extension v${extensionVersion}`}
                    />
                    {COMMUNITY_LINKS.map((link) => (
                      <Chip
                        key={link.label}
                        size="small"
                        variant="outlined"
                        label={link.label}
                        component="a"
                        href={link.href}
                        clickable
                        target="_blank"
                        rel="noreferrer noopener"
                        icon={<LaunchIcon />}
                      />
                    ))}
                  </Stack>
                </Stack>
              </Stack>

              <Divider />

              <Stack direction={{ xs: "column", lg: "row" }} spacing={3} alignItems="stretch">
                <Stack spacing={3} sx={{ flex: "1 1 55%" }}>
                  <Stack spacing={1.5}>
                    <Typography variant="h6">Getting Started</Typography>
                    <Typography variant="body2" color="text.secondary">
                      The Containerlab extension integrates containerlab directly into VS Code,
                      providing an explorer for managing labs and containers.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Create, deploy, and manage network topologies with just a few clicks.
                    </Typography>
                    <Stack spacing={0.75} alignItems="flex-start">
                      <Button
                        variant="contained"
                        onClick={() => {
                          postMessage({ command: "createExample" });
                        }}
                      >
                        Create Example Topology
                      </Button>
                      <Typography variant="caption" color="text.secondary">
                        Creates `example.clab.yml` in your current workspace.
                      </Typography>
                    </Stack>
                  </Stack>

                  <Stack spacing={1.5}>
                    <Typography variant="h6">Documentation and Resources</Typography>
                    <List dense disablePadding>
                      {RESOURCE_LINKS.map((link) => (
                        <ListItem key={link.label} disableGutters sx={{ py: 0.25 }}>
                          <Link href={link.href} target="_blank" rel="noreferrer noopener">
                            {link.label}
                          </Link>
                        </ListItem>
                      ))}
                    </List>

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={dontShowAgain}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setDontShowAgain(checked);
                            postMessage({ command: "dontShowAgain", value: checked });
                          }}
                        />
                      }
                      label="Don't show this page again"
                    />
                  </Stack>
                </Stack>

                <Stack spacing={1.5} sx={{ flex: "1 1 45%", minWidth: 0 }}>
                  <Typography variant="h6">Popular Topologies</Typography>

                  {usingFallback ? (
                    <Alert severity="info" variant="outlined">
                      Using cached repository data due to GitHub API limits or temporary failures.
                    </Alert>
                  ) : null}

                  {isLoadingRepos ? (
                    <Stack
                      direction="row"
                      spacing={1.5}
                      alignItems="center"
                      sx={{ py: 2, color: "text.secondary" }}
                    >
                      <CircularProgress size={18} />
                      <Typography variant="body2">Loading popular repositories...</Typography>
                    </Stack>
                  ) : null}

                  {!isLoadingRepos && repos.length === 0 ? (
                    <Alert severity="info" variant="outlined">
                      No repositories found.
                    </Alert>
                  ) : null}

                  {!isLoadingRepos && repos.length > 0 ? (
                    <List
                      dense
                      disablePadding
                      sx={{
                        maxHeight: 420,
                        overflowY: "auto",
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 1
                      }}
                    >
                      {repos.map((repo) => (
                        <ListItem key={repo.html_url} disablePadding divider>
                          <ListItemButton
                            component="a"
                            href={repo.html_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            sx={{ alignItems: "flex-start" }}
                          >
                            <Stack spacing={0.5} sx={{ width: "100%", minWidth: 0 }}>
                              <Stack
                                direction="row"
                                spacing={1}
                                alignItems="center"
                                sx={{ minWidth: 0 }}
                              >
                                <Typography
                                  component="span"
                                  variant="body2"
                                  sx={{
                                    fontWeight: 600,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis"
                                  }}
                                >
                                  {repo.name}
                                </Typography>
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  icon={<StarIcon />}
                                  label={repo.stargazers_count}
                                  sx={{
                                    "& .MuiChip-icon": {
                                      color: "warning.main"
                                    }
                                  }}
                                />
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {repo.description || "No description available"}
                              </Typography>
                            </Stack>
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  ) : null}
                </Stack>
              </Stack>
            </Stack>
          </Paper>
        </Container>
      </Box>
    </MuiThemeProvider>
  );
}

function bootstrapWelcomePage(): void {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Welcome page root element not found");
  }

  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <WelcomePageApp />
    </React.StrictMode>
  );
}

bootstrapWelcomePage();
