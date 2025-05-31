import * as vscode from "vscode";
import * as fs from "fs";
import * as yaml from "js-yaml";
import { execCommandInTerminal } from "./command";
import { ClabLabTreeNode } from "../treeView/common";

export async function runFcli(node: ClabLabTreeNode) {
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
    const cmd = `${runtime} run -it --network ${network} --rm -v /etc/hosts:/etc/hosts:ro -v "${labPath}":/topo.yml ghcr.io/srl-labs/nornir-srl:latest -t /topo.yml`;

    execCommandInTerminal(cmd, `fcli-${network}`);
}
