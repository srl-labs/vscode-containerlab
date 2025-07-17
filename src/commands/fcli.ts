import * as vscode from "vscode";
import * as fs from "fs";
import * as YAML from "yaml";
import { execCommandInTerminal } from "./command";
import { ClabLabTreeNode } from "../treeView/common";
import { getSudo } from "../utils";

function buildNetworkFromYaml(topoPath: string): string {
    try {
        const content = fs.readFileSync(topoPath, "utf8");
        const doc = YAML.parse(content);
        const net = doc?.mgmt?.network;
        if (typeof net === 'string' && net.trim().length > 0) {
            return net.trim();
        }
    } catch {
        // ignore errors
    }
    return "clab";
}

function runFcli(node: ClabLabTreeNode, cmd: string) {
    if (!node) {
        vscode.window.showErrorMessage('No lab node selected.');
        return;
    }

    const topo = node.labPath?.absolute;
    if (!topo) {
        vscode.window.showErrorMessage('No topology path found.');
        return;
    }

    const config = vscode.workspace.getConfiguration("containerlab");
    const runtime = config.get<string>("runtime", "docker");

    const network = buildNetworkFromYaml(topo);

    const command = `${getSudo()}${runtime} run --pull always -it --network ${network} --rm -v /etc/hosts:/etc/hosts:ro -v "${topo}":/topo.yml ghcr.io/srl-labs/nornir-srl:latest -t /topo.yml ${cmd}`;

    execCommandInTerminal(command, `fcli - ${node.label}`);
}

export const fcliBgpPeers = (node: ClabLabTreeNode) => runFcli(node, "bgp-peers");
export const fcliBgpRib = (node: ClabLabTreeNode) => runFcli(node, "bgp-rib");
export const fcliIpv4Rib = (node: ClabLabTreeNode) => runFcli(node, "ipv4-rib");
export const fcliLldp = (node: ClabLabTreeNode) => runFcli(node, "lldp");
export const fcliMac = (node: ClabLabTreeNode) => runFcli(node, "mac");
export const fcliNi = (node: ClabLabTreeNode) => runFcli(node, "ni");
export const fcliSubif = (node: ClabLabTreeNode) => runFcli(node, "subif");
export const fcliSysInfo = (node: ClabLabTreeNode) => runFcli(node, "sys-info");

export async function fcliCustom(node: ClabLabTreeNode) {
    const val = await vscode.window.showInputBox({
        title: 'Custom fcli command',
        placeHolder: 'Enter command, e.g. bgp-peers',
    });
    if (!val || val.trim().length === 0) {
        return;
    }
    runFcli(node, val.trim());
}
