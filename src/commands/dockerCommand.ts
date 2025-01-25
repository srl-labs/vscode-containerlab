import * as cmd from './command';

/**
 * A helper class to build a 'docker' command (with optional sudo, etc.)
 * and run it either in the Output channel or in a Terminal.
 */
export class DockerCommand extends cmd.Command  {
    private action: string;

    constructor(action: string, spinnerMsg?: cmd.SpinnerMsg) {4
        const options: cmd.CmdOptions = {
            command: "docker",
            useSpinner: true,
            spinnerMsg: spinnerMsg,       
        }
        super(options);

        this.action = action;
    }

    public run(containerID: string) {

        // Build the command
        const cmd = [this.action, containerID]

        this.execute(cmd);
    }
}