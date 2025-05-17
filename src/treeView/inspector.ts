import * as vscode from "vscode";
import * as utils from "../utils";
import * as c from "./common";

import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

export let rawInspectData: any;
export let transformedInspectData: c.ClabJSON;

const config = vscode.workspace.getConfiguration("containerlab");
const runtime = config.get<string>("runtime", "docker");

export async function update() {

    console.log("[inspector]:\tUpdating inspect data");
    const t_start = Date.now()

    const cmd = `${utils.getSudo()}containerlab inspect -r ${runtime} --all --details --format json 2>/dev/null`;

    let clabStdout;
    try {
        const { stdout } = await execAsync(cmd);
        clabStdout = stdout;
    } catch (err) {
        throw new Error(`Could not run ${cmd}.\n${err}`);
    }

    if (!clabStdout) {
        return undefined;
    }

    rawInspectData = JSON.parse(clabStdout);

    const duration = (Date.now() - t_start) / 1000;

    console.log(`[inspector]:\tParsed inspect data. Took ${duration} seconds.`);
}