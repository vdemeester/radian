{
  description = "Analytics and usage insights for pi-coding-agent sessions";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages = {
          radian = pkgs.buildNpmPackage {
            pname = "radian";
            version = "0.1.0";

            src = ./.;

            npmDepsHash = "sha256-EvehF3ULZzZL3BXNwfVGS/qkJhcYg9YaWCAjlneoFjg=";

            # Build TypeScript
            buildPhase = ''
              runHook preBuild
              npx tsc
              runHook postBuild
            '';

            # Install the built output and set up the binary
            installPhase = ''
              runHook preInstall
              mkdir -p $out/lib/node_modules/radian
              cp -r dist $out/lib/node_modules/radian/
              cp package.json $out/lib/node_modules/radian/

              # Copy production node_modules (only commander)
              cp -r node_modules $out/lib/node_modules/radian/

              mkdir -p $out/bin
              ln -s $out/lib/node_modules/radian/dist/index.js $out/bin/radian
              chmod +x $out/lib/node_modules/radian/dist/index.js
              runHook postInstall
            '';

            meta = with pkgs.lib; {
              description = "Analytics and usage insights for pi-coding-agent sessions";
              homepage = "https://github.com/vdemeester/radian";
              license = licenses.mit;
              mainProgram = "radian";
            };
          };

          default = self.packages.${system}.radian;
        };

        checks = {
          radian = self.packages.${system}.radian;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_22
            prefetch-npm-deps
          ];
        };
      }
    );
}
