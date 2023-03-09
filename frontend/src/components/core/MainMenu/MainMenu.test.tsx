/**
 * Copyright (c) Streamlit Inc. (2018-2022) Snowflake Inc. (2022)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react"

import { mount, render } from "src/lib/test_util"
import { IMenuItem } from "src/hocs/withHostCommunication/types"

import { Config, GitInfo, IGitInfo } from "src/autogen/proto"
import { IDeployErrorDialog } from "src/components/core/StreamlitDialog/DeployErrorDialogs/types"
import {
  DetachedHead,
  ModuleIsNotAdded,
  NoRepositoryDetected,
  RepoIsAhead,
  UncommittedChanges,
  UntrackedFiles,
} from "src/components/core/StreamlitDialog/DeployErrorDialogs"
import { getMetricsManagerForTest } from "src/lib/MetricsManagerTestUtils"

import MainMenu, { Props } from "./MainMenu"
import { fireEvent, RenderResult, waitFor } from "@testing-library/react"

const { GitStates } = GitInfo

const getProps = (extend?: Partial<Props>): Props => ({
  aboutCallback: jest.fn(),
  printCallback: jest.fn(),
  clearCacheCallback: jest.fn(),
  isServerConnected: true,
  quickRerunCallback: jest.fn(),
  hostMenuItems: [],
  screencastCallback: jest.fn(),
  screenCastState: "",
  sendMessageToHost: jest.fn(),
  settingsCallback: jest.fn(),
  isDeployErrorModalOpen: false,
  showDeployError: jest.fn(),
  loadGitInfo: jest.fn(),
  closeDialog: jest.fn(),
  canDeploy: true,
  menuItems: {},
  hostIsOwner: false,
  gitInfo: null,
  metricsMgr: getMetricsManagerForTest(),
  toolbarMode: Config.ToolbarMode.AUTO,
  ...extend,
})

async function openMenu(wrapper: RenderResult): Promise<void> {
  fireEvent.click(wrapper.getByRole("button"))
  await waitFor(() => expect(wrapper.findByRole("listbox")).toBeDefined())
}

function getMenuStructure(
  renderResult: RenderResult
): ({ type: "separator" } | { type: "option"; label: string })[][] {
  return Array.from(
    renderResult.baseElement.querySelectorAll('[role="listbox"]')
  ).map(listBoxElement => {
    return Array.from(
      listBoxElement.querySelectorAll(
        '[role=option] span:first-of-type, [data-testid="main-menu-divider"]'
      )
    ).map(d =>
      d.getAttribute("data-testid") == "main-menu-divider"
        ? { type: "separator" }
        : { type: "option", label: d.textContent as string }
    )
  })
}

function mockWindowLocation(hostname: string): void {
  // Mock window.location by creating a new object
  // Source: https://www.benmvp.com/blog/mocking-window-location-methods-jest-jsdom/
  // @ts-ignore
  delete window.location

  // @ts-ignore
  window.location = {
    assign: jest.fn(),
    hostname: hostname,
  }
}

describe("MainMenu", () => {
  it("renders without crashing", () => {
    const props = getProps()
    const wrapper = mount(<MainMenu {...props} />)

    expect(wrapper).toBeDefined()
  })

  it("should render host menu items", async () => {
    const items: IMenuItem[] = [
      {
        type: "separator",
      },
      {
        type: "text",
        label: "View app source",
        key: "source",
      },
      {
        type: "text",
        label: "Report bug with app",
        key: "support",
      },
      {
        type: "separator",
      },
    ]
    const props = getProps({
      hostMenuItems: items,
    })
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    await waitFor(() =>
      expect(
        wrapper
          .getAllByRole("option")
          .map(item => item.querySelector("span:first-of-type")?.textContent)
      ).toEqual([
        "Rerun",
        "Settings",
        "Print",
        "Record a screencast",
        "View app source",
        "Report bug with app",
        "About",
        "Developer options",
        "Clear cache",
      ])
    )
  })

  it("should render core set of menu elements", async () => {
    const props = getProps()
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    await waitFor(() =>
      expect(
        wrapper
          .getAllByRole("option")
          .map(item => item.querySelector("span:first-of-type")?.textContent)
      ).toEqual([
        "Rerun",
        "Settings",
        "Print",
        "Record a screencast",
        "About",
        "Developer options",
        "Clear cache",
        "Deploy this app",
      ])
    )
  })

  it("should render deploy app menu item", async () => {
    const props = getProps({ gitInfo: {} })
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    await waitFor(() =>
      expect(
        wrapper.getByRole("option", { name: "Deploy this app" })
      ).toBeDefined()
    )
  })

  describe("Onclick deploy button", () => {
    function testDeployErrorModal(
      gitInfo: Partial<IGitInfo>,
      dialogComponent: (module: string) => IDeployErrorDialog
    ): void {
      const props = getProps({
        gitInfo,
      })
      const wrapper = mount(<MainMenu {...props} />)
      const popoverContent = wrapper.find("StatefulPopover").prop("content")

      // @ts-ignore
      const menuWrapper = mount(popoverContent(() => {}))
      const items: any = menuWrapper.find("StatefulMenu").at(1).prop("items")

      const deployOption = items.find(
        // @ts-ignore
        ({ label }) => label === "Deploy this app"
      )

      deployOption.onClick()

      // @ts-ignore
      const dialog = dialogComponent(props.gitInfo.module)
      // @ts-ignore
      expect(props.showDeployError.mock.calls[0][0]).toStrictEqual(
        dialog.title
      )
      // @ts-ignore
      expect(props.showDeployError.mock.calls[0][1]).toStrictEqual(dialog.body)
    }

    it("should display the correct modal if there is no repo or remote", () => {
      testDeployErrorModal(
        {
          state: GitStates.DEFAULT,
        },
        NoRepositoryDetected
      )
    })

    it("should display the correct modal if there is an empty repo", () => {
      testDeployErrorModal(
        {
          repository: "",
          branch: "",
          module: "",
          state: GitStates.DEFAULT,
        },
        NoRepositoryDetected
      )
    })

    it("should display the correct modal if the repo is detached", () => {
      testDeployErrorModal(
        {
          repository: "repo",
          branch: "branch",
          module: "module",
          state: GitStates.HEAD_DETACHED,
        },
        DetachedHead
      )
    })

    it("should display the correct modal if the script is not added to the repo", () => {
      testDeployErrorModal(
        {
          repository: "repo",
          branch: "branch",
          module: "module.py",
          state: GitStates.DEFAULT,
          untrackedFiles: ["module.py"],
        },
        ModuleIsNotAdded
      )
    })

    it("should display the correct modal if there are uncommitted changes in the repo", () => {
      testDeployErrorModal(
        {
          repository: "repo",
          branch: "branch",
          module: "module.py",
          state: GitStates.DEFAULT,
          uncommittedFiles: ["module.py"],
          untrackedFiles: [],
        },
        UncommittedChanges
      )
    })

    it("should display the correct modal if there are changes not pushed to GitHub", () => {
      const deployParams: IGitInfo = {
        repository: "repo",
        branch: "branch",
        module: "module.py",
        uncommittedFiles: [],
        untrackedFiles: [],
        state: GitStates.AHEAD_OF_REMOTE,
      }
      testDeployErrorModal(deployParams, RepoIsAhead)
    })

    it("should display the correct modal if there are untracked files", () => {
      testDeployErrorModal(
        {
          repository: "repo",
          branch: "branch",
          module: "module.py",
          state: GitStates.DEFAULT,
          untrackedFiles: ["another-file.py"],
        },
        UntrackedFiles
      )
    })
  })

  it("should not render set of configurable elements", () => {
    const menuItems = {
      hideGetHelp: true,
      hideReportABug: true,
      aboutSectionMd: "",
    }
    const props = getProps({ menuItems })
    const wrapper = mount(<MainMenu {...props} />)
    const popoverContent = wrapper.find("StatefulPopover").prop("content")
    // @ts-ignore
    const menuWrapper = mount(popoverContent(() => {}))

    // @ts-ignore
    const menuLabels = menuWrapper
      .find("MenuStatefulContainer")
      .at(0)
      .prop("items")
      // @ts-ignore
      .map(item => item.label)
    expect(menuLabels).toEqual([
      "Rerun",
      "Settings",
      "Print",
      "Record a screencast",
      "About",
    ])
  })

  it("should not render report a bug in core menu", async () => {
    const menuItems = {
      getHelpUrl: "testing",
      hideGetHelp: false,
      hideReportABug: true,
      aboutSectionMd: "",
    }
    const props = getProps({ menuItems })
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    await waitFor(() =>
      expect(
        wrapper.queryByRole("option", { name: "Report a bug" })
      ).toBeNull()
    )
  })

  it("should render report a bug in core menu", async () => {
    const menuItems = {
      reportABugUrl: "testing",
      hideGetHelp: false,
      hideReportABug: false,
      aboutSectionMd: "",
    }
    const props = getProps({ menuItems })
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    await waitFor(() =>
      expect(
        wrapper.getByRole("option", { name: "Report a bug" })
      ).toBeDefined()
    )
  })

  it("should not render dev menu when hostIsOwner is false and not on localhost", () => {
    mockWindowLocation("remoteHost")

    const props = getProps()
    const wrapper = mount(<MainMenu {...props} />)
    const popoverContent = wrapper.find("StatefulPopover").prop("content")
    // @ts-ignore
    const menuWrapper = mount(popoverContent(() => {}))

    // @ts-ignore
    const menuLabels = menuWrapper
      .find("MenuStatefulContainer")
      // make sure that we only have one menu otherwise prop will fail
      .prop("items")
      // @ts-ignore
      .map(item => item.label)
    expect(menuLabels).toEqual([
      "Rerun",
      "Settings",
      "Print",
      "Record a screencast",
      "About",
    ])
  })

  it.each([
    // # Test cases for toolbarMode = Config.ToolbarMode.AUTO
    // Show developer menu only for localhost.
    ["localhost", false, Config.ToolbarMode.AUTO, true],
    ["127.0.0.1", false, Config.ToolbarMode.AUTO, true],
    ["remoteHost", false, Config.ToolbarMode.AUTO, false],
    // Show developer menu only for all host when hostIsOwner == true.
    ["localhost", true, Config.ToolbarMode.AUTO, true],
    ["127.0.0.1", true, Config.ToolbarMode.AUTO, true],
    ["remoteHost", true, Config.ToolbarMode.AUTO, true],
    // # Test cases for toolbarMode = Config.ToolbarMode.DEVELOPER
    // Show developer menu always regardless of other parameters
    ["localhost", false, Config.ToolbarMode.DEVELOPER, true],
    ["127.0.0.1", false, Config.ToolbarMode.DEVELOPER, true],
    ["remoteHost", false, Config.ToolbarMode.DEVELOPER, true],
    ["localhost", true, Config.ToolbarMode.DEVELOPER, true],
    ["127.0.0.1", true, Config.ToolbarMode.DEVELOPER, true],
    ["remoteHost", true, Config.ToolbarMode.DEVELOPER, true],
    // # Test cases for toolbarMode = Config.ToolbarMode.VIEWER
    // Hide developer menu always regardless of other parameters
    ["localhost", false, Config.ToolbarMode.VIEWER, false],
    ["127.0.0.1", false, Config.ToolbarMode.VIEWER, false],
    ["remoteHost", false, Config.ToolbarMode.VIEWER, false],
    ["localhost", true, Config.ToolbarMode.VIEWER, false],
    ["127.0.0.1", true, Config.ToolbarMode.VIEWER, false],
    ["remoteHost", true, Config.ToolbarMode.VIEWER, false],
  ])(
    "should render or not render dev menu depending on hostname, host ownership, toolbarMode[%s, %s, %s]",
    async (hostname, hostIsOwner, toolbarMode, devMenuVisible) => {
      mockWindowLocation(hostname)

      const props = getProps({ hostIsOwner, toolbarMode })
      const wrapper = render(<MainMenu {...props} />)
      await openMenu(wrapper)

      const menuStructure = getMenuStructure(wrapper)
      expect(menuStructure).toHaveLength(devMenuVisible ? 2 : 1)
    }
  )

  it.each([
    [Config.ToolbarMode.AUTO],
    [Config.ToolbarMode.DEVELOPER],
    [Config.ToolbarMode.VIEWER],
    [Config.ToolbarMode.MINIMAL],
  ])("should render host menu items if available[%s]", async toolbarMode => {
    const props = getProps({
      toolbarMode,
      hostMenuItems: [
        { label: "Host menu item", key: "host-item", type: "text" },
      ],
    })
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    const menuStructure = getMenuStructure(wrapper)
    expect(menuStructure[0]).toContainEqual({
      type: "option",
      label: "Host menu item",
    })
  })

  it("should hide hamburger when toolbarMode is Minimal and no host items", async () => {
    const props = getProps({
      toolbarMode: Config.ToolbarMode.MINIMAL,
      hostMenuItems: [],
    })

    const wrapper = render(<MainMenu {...props} />)

    expect(wrapper.queryByRole("button")).toBeNull()
  })

  it("should skip divider from host menu items if it is at the beginning and end", async () => {
    const props = getProps({
      toolbarMode: Config.ToolbarMode.MINIMAL,
      hostMenuItems: [
        { type: "separator" },
        { type: "text", label: "View all apps", key: "viewAllApps" },
        { type: "separator" },
        { type: "text", label: "About Streamlit Cloud", key: "about" },
        { type: "separator" },
      ],
    })
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    const menuStructure = getMenuStructure(wrapper)
    expect(menuStructure).toEqual([
      [{ type: "option", label: "View all apps" }],
    ])
  })

  it.each([
    [
      ["getHelpUrl", "reportABugUrl", "aboutSectionMd"],
      [
        {
          label: "Report a bug",
          type: "option",
        },
        {
          label: "Get help",
          type: "option",
        },
        {
          type: "separator",
        },
        {
          label: "About",
          type: "option",
        },
      ],
    ],
    [
      ["getHelpUrl"],
      [
        {
          label: "Get help",
          type: "option",
        },
      ],
    ],
    [
      ["reportABugUrl"],
      [
        {
          label: "Report a bug",
          type: "option",
        },
      ],
    ],
    [
      ["aboutSectionMd"],
      [
        {
          label: "About",
          type: "option",
        },
      ],
    ],
  ])(
    "should render custom items in minimal mode[%s]",
    async (menuItems, expectedMenuItems) => {
      const allMenuItems = {
        getHelpUrl: "https://www.extremelycoolapp.com/help",
        reportABugUrl: "https://www.extremelycoolapp.com/bug",
        aboutSectionMd: "# This is a header. This is an *extremely* cool app!",
      }
      const props = getProps({
        toolbarMode: Config.ToolbarMode.MINIMAL,
        menuItems: Object.fromEntries(
          Object.entries(allMenuItems).filter(d => menuItems.includes(d[0]))
        ),
      })

      const wrapper = render(<MainMenu {...props} />)
      await openMenu(wrapper)

      const menuStructure = getMenuStructure(wrapper)
      expect(menuStructure).toEqual([expectedMenuItems])
    }
  )

  it("should render host menu items and custom items in minimal mode", async () => {
    const props = getProps({
      toolbarMode: Config.ToolbarMode.MINIMAL,
      hostMenuItems: [
        { type: "separator" },
        { type: "text", label: "View all apps", key: "viewAllApps" },
        { type: "separator" },
        { type: "text", label: "About Streamlit Cloud", key: "about" },
        { type: "separator" },
      ],
      menuItems: {
        getHelpUrl: "https://www.extremelycoolapp.com/help",
        reportABugUrl: "https://www.extremelycoolapp.com/bug",
        aboutSectionMd: "# This is a header. This is an *extremely* cool app!",
      },
    })
    const wrapper = render(<MainMenu {...props} />)
    await openMenu(wrapper)

    const menuStructure = getMenuStructure(wrapper)
    expect(menuStructure).toEqual([
      [
        {
          label: "Report a bug",
          type: "option",
        },
        {
          label: "Get help",
          type: "option",
        },
        {
          type: "separator",
        },
        {
          label: "View all apps",
          type: "option",
        },
        {
          type: "separator",
        },
        {
          label: "About",
          type: "option",
        },
      ],
    ])
  })
})
