import * as vscode from "vscode";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { execCommandInTerminal } from "./command";
import { ClabLabTreeNode } from "../treeView/common";

export async function runFcli(node: ClabLabTreeNode, subcmd?: string) {
    if (!node) {
        vscode.window.showErrorMessage("No lab node selected.");
        return;
    }

    const labPath = node.labPath.absolute;
    if (!labPath) {
        vscode.window.showErrorMessage("No topology file found for this lab.");
        return;
    }

    let topo: any;
    try {
        const content = fs.readFileSync(labPath, "utf8");
        topo = yaml.load(content);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to read topology file: ${err.message}`);
        return;
    }

    let network = "clab";
    const mgmt = topo?.mgmt;
    if (mgmt) {
        if (typeof mgmt === "string") {
            network = mgmt;
        } else if (typeof mgmt.network === "string") {
            network = mgmt.network;
        }
    }

    const runtime = vscode.workspace.getConfiguration("containerlab").get<string>("runtime", "docker");
    let cmd = `${runtime} run -it --network ${network} --rm -v /etc/hosts:/etc/hosts:ro -v "${labPath}":/topo.yml ghcr.io/srl-labs/nornir-srl:latest -t /topo.yml`;

    if (subcmd) {
        cmd += ` ${subcmd}`;
    }

    execCommandInTerminal(cmd, `fcli-${network}`);
}

export function fcliBgpPeers(node: ClabLabTreeNode) {
    runFcli(node, 'bgp-peers');
}

export function fcliBgpRib(node: ClabLabTreeNode) {
    runFcli(node, 'bgp-rib');
}

export function fcliIpv4Rib(node: ClabLabTreeNode) {
    runFcli(node, 'ipv4-rib');
}

export function fcliLldp(node: ClabLabTreeNode) {
    runFcli(node, 'lldp');
}

export function fcliMac(node: ClabLabTreeNode) {
    runFcli(node, 'mac');
}

export function fcliNi(node: ClabLabTreeNode) {
    runFcli(node, 'ni');
}

export function fcliSubif(node: ClabLabTreeNode) {
    runFcli(node, 'subif');
}

export function fcliSysInfo(node: ClabLabTreeNode) {
    runFcli(node, 'sys-info');
}
