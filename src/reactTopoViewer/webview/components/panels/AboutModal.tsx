// About dialog.
import React from "react";
import {
  Avatar,
  Box,
  Card,
  CardActionArea,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  Typography,
} from "@mui/material";
import {
  Close as CloseIcon,
  Extension as ExtensionIcon,
  Favorite as FavoriteIcon,
  GitHub as GitHubIcon,
  Groups as GroupsIcon,
  MenuBook as MenuBookIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AuthorCardProps {
  name: string;
  title: string;
  linkedIn: string;
  iconText: string;
  iconColor: string;
}

const TEXT_SECONDARY = "text.secondary";

const AuthorCard: React.FC<AuthorCardProps> = ({ name, title, linkedIn, iconText, iconColor }) => (
  <Card variant="outlined" sx={{ mb: 1 }}>
    <CardActionArea
      component="a"
      href={linkedIn}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}
    >
      <Avatar sx={{ bgcolor: iconColor, width: 32, height: 32, fontSize: "0.875rem" }}>
        {iconText}
      </Avatar>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2" fontWeight={500}>
          {name}
        </Typography>
        <Typography variant="caption" color={TEXT_SECONDARY}>
          {title}
        </Typography>
      </Box>
      <OpenInNewIcon fontSize="small" sx={{ color: TEXT_SECONDARY }} />
    </CardActionArea>
  </Card>
);

interface RepoCardProps {
  name: string;
  description: string;
  url: string;
  icon: React.ReactNode;
}

const RepoCard: React.FC<RepoCardProps> = ({ name, description, url, icon }) => (
  <Card variant="outlined" sx={{ mb: 1 }}>
    <CardActionArea
      component="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      sx={{ p: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}
    >
      <Box sx={{ color: TEXT_SECONDARY }}>{icon}</Box>
      <Box sx={{ flexGrow: 1 }}>
        <Typography variant="body2" fontWeight={500}>
          {name}
        </Typography>
        <Typography variant="caption" color={TEXT_SECONDARY}>
          {description}
        </Typography>
      </Box>
      <OpenInNewIcon fontSize="small" sx={{ color: TEXT_SECONDARY }} />
    </CardActionArea>
  </Card>
);

/**
 * Animated Containerlab flask logo with bubbles
 */
const AnimatedContainerlabLogo: React.FC = () => (
  <>
    <svg
      viewBox="65.95 14.96 118.48 127.34"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: 48, height: 48 }}
    >
      <g transform="matrix(1.27707402803300 0 0 1.27707402803300 -135.85348004729036 -121.99491568571256)">
        <g transform="matrix(1 0 0 1 0.07761382500030 0.06641805000012)">
          {/* Animated bubbles */}
          <g id="modal-bubbles">
            <g
              style={{
                offsetPath:
                  'path("M205.884199,165.860001C197.074282,167.998330,195.705752,161.169993,195.705752,158.843356C195.597238,154.417121,207.484159,154.853512,204.543302,147.117108")',
                offsetRotate: "0deg",
              }}
              id="modal-small-bubble_to"
            >
              <path
                strokeWidth="0.8"
                stroke="rgb(0,201,255)"
                fill="none"
                transform="scale(1.737107,1.656190) translate(-195.332199,-165.860001)"
                d="M197.090000,165.860000C197.090000,166.332854,196.904804,166.786342,196.575152,167.120701C196.245501,167.455059,195.798398,167.642900,195.332200,167.642900C194.866002,167.642900,194.418899,167.455059,194.089248,167.120701C193.759596,166.786342,193.574400,166.332854,193.574400,165.860000C193.574400,165.387146,193.759596,164.933658,194.089248,164.599299C194.418899,164.264941,194.866002,164.077100,195.332200,164.077100C195.798398,164.077100,196.245501,164.264941,196.575152,164.599299C196.904804,164.933658,197.090000,165.387146,197.090000,165.860000"
                id="modal-small-bubble"
              />
            </g>
            <g
              style={{
                offsetPath:
                  'path("M197.413191,161.660004C199.739487,153.100729,206.577824,157.960197,206.367518,150.296087Q197.733947,137.765919,204.968877,131.776987")',
                offsetRotate: "0deg",
              }}
              id="modal-mid-bubble_to"
            >
              <g transform="scale(1,1)" id="modal-mid-bubble_ts">
                <path
                  strokeWidth="0.8"
                  stroke="rgb(0,201,255)"
                  fill="none"
                  transform="translate(-186.861191,-161.660004)"
                  d="M189.620000,161.660000C189.620000,163.125211,188.384843,164.313000,186.861200,164.313000C185.337557,164.313000,184.102400,163.125211,184.102400,161.660000C184.102400,160.194789,185.337557,159.007000,186.861200,159.007000C188.384843,159.007000,189.620000,160.194789,189.620000,161.660000"
                  id="modal-mid-bubble"
                />
              </g>
            </g>
            <g
              style={{
                offsetPath:
                  'path("M202.937712,152.410004C210.676320,150.141269,203.420795,132.803737,202.846000,130.576097Q201.344264,117.338369,204.543310,117.443650")',
                offsetRotate: "0deg",
              }}
              id="modal-big-bubble_to"
            >
              <g transform="scale(1,1)" id="modal-big-bubble_ts">
                <path
                  strokeWidth="0.8"
                  stroke="rgb(0,201,255)"
                  fill="none"
                  transform="translate(-192.385712,-152.410004)"
                  d="M196.490000,152.410000C196.490000,153.460523,196.057584,154.468018,195.287878,155.210850C194.518173,155.953682,193.474228,156.371000,192.385700,156.371000C191.297172,156.371000,190.253227,155.953682,189.483522,155.210850C188.713816,154.468018,188.281400,153.460523,188.281400,152.410000C188.281400,151.359477,188.713816,150.351982,189.483522,149.609150C190.253227,148.866318,191.297172,148.449000,192.385700,148.449000C193.474228,148.449000,194.518173,148.866318,195.287878,149.609150C196.057584,150.351982,196.490000,151.359477,196.490000,152.410000"
                  id="modal-big-bubble"
                />
              </g>
            </g>
          </g>
          {/* Liquid */}
          <path
            fill="rgb(0,201,255)"
            transform="matrix(1 0 0 1 10.55200000000002 0)"
            d="M184.690000,168.960000C184.185000,169.173000,183.162000,169.812000,182.417000,170.380000C180.987000,171.471000,179.261000,171.742000,177.109000,171.214000C175.556000,170.833000,175.446000,171.282000,176.519000,173.615000C183.150000,188.035000,203.367000,188.511000,210.399000,174.414000C211.978000,171.249000,211.832000,170.694000,209.581000,171.316000C207.681000,171.840000,206.401000,171.543000,204.609000,170.159000C202.173000,168.278000,198.913000,168.276000,197.213000,170.155000C195.511000,172.036000,191.852000,171.948000,189.736000,169.977000C188.537000,168.859000,186.097000,168.368000,184.690000,168.960000"
          />
        </g>
        {/* Flask outline */}
        <path
          fillRule="evenodd"
          fill="rgb(152,162,174)"
          transform="matrix(1 0 0 1 10.55200000000002 0)"
          d="M183.880000,108.030000C182.975000,108.336000,180.383000,109.681000,178.119000,111.020000C174.266000,113.298000,167.106000,117.405000,163.002000,119.692000C154.092000,124.657000,150.780000,126.932000,149.402000,129.032000L148.002000,131.167000L148.002000,179.167000L149.497000,181.401000C150.478000,182.867000,151.646000,184.005000,152.897000,184.712000C153.945000,185.305000,155.072000,185.961000,155.402000,186.169000C156.829000,187.070000,162.284000,190.167000,162.443000,190.167000C162.539000,190.167000,163.379000,190.657000,164.310000,191.257000C165.241000,191.856000,166.378000,192.550000,166.837000,192.800000C171.955000,195.575000,173.293000,196.343000,173.833000,196.815000C174.181000,197.119000,174.573000,197.367000,174.706000,197.367000C174.918000,197.367000,184.217000,202.726000,185.802000,203.760000C190.866000,207.068000,195.086000,207.316000,200.002000,204.597000C201.762000,203.623000,203.562000,202.628000,204.002000,202.386000C204.442000,202.144000,205.573000,201.450000,206.515000,200.844000C207.457000,200.237000,208.987000,199.349000,209.915000,198.870000C210.843000,198.391000,213.172000,197.047000,215.090000,195.883000C217.008000,194.719000,218.661000,193.767000,218.762000,193.767000C218.864000,193.767000,221.614000,192.191000,224.874000,190.264000C228.135000,188.337000,231.446000,186.423000,232.233000,186.010000C235.260000,184.422000,236.849000,183.058000,238.102000,180.969000L239.402000,178.802000L239.398000,155.185000L239.394000,131.567000L238.210000,129.501000C237.558000,128.365000,236.345000,126.960000,235.513000,126.380000C233.718000,125.126000,223.946000,119.429000,218.402000,116.404000C217.962000,116.163000,217.332000,115.762000,217.002000,115.512000C216.672000,115.261000,215.502000,114.577000,214.402000,113.990000C213.302000,113.404000,212.049000,112.709000,211.617000,112.446000C202.831000,107.089000,200.603000,106.557000,198.619000,109.343000C197.827000,110.455000,197.802000,111.012000,197.802000,127.549000L197.802000,144.608000L199.302000,145.205000C203.837000,147.012000,204.578000,147.414000,207.187000,149.483000C209.492000,151.312000,214.000800,157.840700,214.000800,159.044700C214.000800,159.338700,213.654000,158.593970,213.963000,159.081000C216.050000,162.378000,215.532000,170.454000,212.910000,175.496000C201.150000,198.109000,167.417000,185.996000,172.764000,161.079000C174.197000,154.401000,182.896000,145.510000,187.890000,145.367000C189.849000,145.310900,189.802000,144.583000,189.802000,127.458000C189.802000,110.441000,189.769000,110.106000,187.943000,108.522000C186.824000,107.552000,185.697000,107.416000,183.880000,108.030000M185.457000,123.404000C185.469000,129.214000,185.461000,135.695000,185.440000,137.806000L185.402000,141.645000L182.424000,143.117000C158.291000,155.044000,166.727000,191.491000,193.602000,191.407000C220.979000,191.322000,229.072000,155.307000,204.515000,142.842000L202.002000,141.567000L202.002000,112.367000L202.981000,112.476000C203.519000,112.536000,204.239000,112.826000,204.581000,113.120000C204.922000,113.413000,206.436000,114.323000,207.945000,115.141000C209.453000,115.959000,211.841000,117.334000,213.252000,118.197000C214.662000,119.061000,215.887000,119.767000,215.975000,119.767000C216.231000,119.767000,228.987000,127.194000,231.574000,128.849000C235.811000,131.561000,235.587000,130.140000,235.696000,154.967000L235.791000,176.367000L234.866000,178.167000C233.953000,179.942000,232.343000,181.304000,229.202000,182.956000C227.541000,183.829000,226.700000,184.321000,225.004000,185.410000C224.453000,185.764000,222.922000,186.649000,221.602000,187.376000C217.875000,189.429000,217.201000,189.816000,210.802000,193.571000C207.502000,195.508000,204.082000,197.480000,203.202000,197.953000C202.322000,198.426000,200.144000,199.658000,198.363000,200.690000C193.439000,203.543000,193.350000,203.521000,182.003000,196.684000C181.563000,196.419000,180.769000,196.007000,180.239000,195.770000C179.710000,195.533000,178.486000,194.805000,177.519000,194.153000C176.553000,193.501000,175.626000,192.967000,175.460000,192.967000C175.294000,192.967000,174.268000,192.398000,173.180000,191.702000C171.072000,190.353000,163.795000,186.167000,163.558000,186.167000C163.481000,186.167000,162.465000,185.582000,161.300000,184.867000C160.135000,184.152000,158.827000,183.349000,158.392000,183.082000C157.958000,182.815000,156.832000,182.196000,155.891000,181.706000C154.950000,181.216000,153.690000,180.174000,153.091000,179.391000L152.002000,177.967000L152.002000,132.347000L152.912000,131.191000C153.756000,130.118000,158.031000,127.004000,158.695000,126.978000C158.856000,126.972000,160.164000,126.247000,161.602000,125.367000C163.040000,124.487000,164.310000,123.767000,164.425000,123.767000C164.540000,123.767000,165.122000,123.432000,165.718000,123.023000C166.848000,122.248000,176.531000,116.640000,180.002000,114.752000C181.102000,114.153000,182.272000,113.435000,182.602000,113.156000C183.346000,112.528000,184.696000,112.215000,185.119000,112.573000C185.293000,112.720000,185.445000,117.594000,185.457000,123.404000"
        />
      </g>
    </svg>
    <style>{`
      #modal-small-bubble_to {
        animation: modal-small-bubble_to__to 1000ms linear infinite normal forwards;
      }
      @keyframes modal-small-bubble_to__to {
        0% { offset-distance: 0%; }
        50% { offset-distance: 50%; }
        100% { offset-distance: 100%; }
      }
      #modal-small-bubble {
        animation: modal-small-bubble_c_o 1000ms linear infinite normal forwards;
      }
      @keyframes modal-small-bubble_c_o {
        0% { opacity: 1; }
        100% { opacity: 0.68; }
      }
      #modal-mid-bubble_to {
        animation: modal-mid-bubble_to__to 1000ms linear infinite normal forwards;
      }
      @keyframes modal-mid-bubble_to__to {
        0% { offset-distance: 0%; }
        50% { offset-distance: 50%; }
        100% { offset-distance: 100%; }
      }
      #modal-mid-bubble_ts {
        animation: modal-mid-bubble_ts__ts 1000ms linear infinite normal forwards;
      }
      @keyframes modal-mid-bubble_ts__ts {
        0% { transform: scale(1, 1); }
        30% { transform: scale(1.177208, 1.230592); }
        50% { transform: scale(1.387962, 1.447246); }
        100% { transform: scale(0.890084, 0.990101); }
      }
      #modal-mid-bubble {
        animation: modal-mid-bubble_c_o 1000ms linear infinite normal forwards;
      }
      @keyframes modal-mid-bubble_c_o {
        0% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      #modal-big-bubble_to {
        animation: modal-big-bubble_to__to 1000ms linear infinite normal forwards;
      }
      @keyframes modal-big-bubble_to__to {
        0% { offset-distance: 0%; }
        50% { offset-distance: 50%; }
        100% { offset-distance: 100%; }
      }
      #modal-big-bubble_ts {
        animation: modal-big-bubble_ts__ts 1000ms linear infinite normal forwards;
      }
      @keyframes modal-big-bubble_ts__ts {
        0% { transform: scale(1, 1); }
        10% { transform: scale(0.833855, 0.806136); }
        20% { transform: scale(0.751891, 0.728111); }
        50% { transform: scale(0.59774, 0.60704); }
        100% { transform: scale(0.59774, 0.60704); }
      }
      #modal-big-bubble {
        animation: modal-big-bubble_c_o 1000ms linear infinite normal forwards;
      }
      @keyframes modal-big-bubble_c_o {
        0% { opacity: 1; }
        100% { opacity: 0.06; }
      }
    `}</style>
  </>
);

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      data-testid="about-modal"
      slotProps={{
        paper: {
          sx: {
            maxHeight: "80vh",
          },
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <AnimatedContainerlabLogo />
          <Typography variant="h5" fontWeight={600}>
            TopoViewer
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {/* Description */}
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color={TEXT_SECONDARY}>
            Interactive topology visualization and editing for{" "}
            <Link href="https://containerlab.dev/" target="_blank" rel="noopener noreferrer">
              Containerlab
            </Link>{" "}
            network labs directly in VS Code.
          </Typography>
        </Box>

        {/* Documentation Section */}
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <MenuBookIcon fontSize="small" />
            Documentation
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <RepoCard
            name="Containerlab Docs"
            description="Full documentation"
            url="https://containerlab.dev/"
            icon={<MenuBookIcon fontSize="small" />}
          />
          <RepoCard
            name="Extension Docs"
            description="VS Code extension guide"
            url="https://containerlab.dev/manual/vsc-extension/"
            icon={<ExtensionIcon fontSize="small" />}
          />
        </Box>

        {/* Team Section */}
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <GroupsIcon fontSize="small" />
            Team
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <AuthorCard
            name="Asad Arafat"
            title="Maintainer (Original Creator)"
            linkedIn="https://www.linkedin.com/in/asadarafat/"
            iconText="AA"
            iconColor="#4CAF50"
          />
          <AuthorCard
            name="Florian Schwarz"
            title="Maintainer"
            linkedIn="https://linkedin.com/in/florian-schwarz-812a34145"
            iconText="FS"
            iconColor="#2196F3"
          />
          <AuthorCard
            name="Kaelem Chandra"
            title="Maintainer"
            linkedIn="https://linkedin.com/in/kaelem-chandra"
            iconText="KC"
            iconColor="#9C27B0"
          />
        </Box>

        {/* Source Code Section */}
        <Divider />
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <GitHubIcon fontSize="small" />
            Source Code
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <RepoCard
            name="vscode-containerlab"
            description="VS Code Extension"
            url="https://github.com/srl-labs/vscode-containerlab/"
            icon={<GitHubIcon fontSize="small" />}
          />
          <RepoCard
            name="topoViewer"
            description="Original Standalone App"
            url="https://github.com/asadarafat/topoViewer"
            icon={<GitHubIcon fontSize="small" />}
          />
        </Box>

        {/* Footer */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.5,
            py: 2,
            color: TEXT_SECONDARY,
          }}
        >
          <Typography variant="caption">Made with</Typography>
          <FavoriteIcon sx={{ fontSize: 14, color: "error.main" }} />
          <Typography variant="caption">for the network community</Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
