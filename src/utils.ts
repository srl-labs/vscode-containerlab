export function stripFileName(path: string) {
    // remove stuff after the final '/' in the path
    return path.substring(0, path.lastIndexOf("/"));
}