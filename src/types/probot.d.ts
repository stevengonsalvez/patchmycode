declare module 'probot' {
  export interface Context {
    payload: any;
    octokit: any;
    repo: <T extends {} = {}>() => { owner: string; repo: string } & T;
    issue: <T extends {} = {}>({ body }: { body: string } & T) => any;
  }

  export class Probot {
    on(events: string | string[], callback: (context: Context) => Promise<void>): void;
  }
}
